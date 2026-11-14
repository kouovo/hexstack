import type { DomainEventPipeline, EventSubscription, JobDispatcher, OutboxJobData } from "@app/application";
import { env } from "@app/env";
import { createLogger, toFieldsLogger } from "@app/logger";
import { createMillstreamDriver, type ISqlQueryBuilder, OUTBOX_TOPIC } from "@app/persistence";
import { CORRELATION_ID, recoverer, Router } from "@millstream/core";
import { jsonEventMarshaler } from "@millstream/cqrs";
import { addForwarder } from "@millstream/forwarder";
import { otelMiddleware } from "@millstream/otel";
import { PgQueueSubscriber } from "@millstream/pg";

/**
 * outbox → relay → one BullMQ job per (event, subscription), on the queue named after the subscription; each retries
 * and fails on its own. The job id is derived from the event id: a relay crash between enqueue and delete does not enqueue twice.
 */
export class MillstreamDomainEventPipeline implements DomainEventPipeline {
  private readonly logger = createLogger("domain-event-pipeline");
  private router?: Router;
  private running?: Promise<void>;

  constructor(
    private readonly db: ISqlQueryBuilder,
    private readonly routes: readonly EventSubscription[],
    private readonly dispatcher: JobDispatcher,
  ) {}

  async start(): Promise<void> {
    if (this.router) return this.router.running;
    const log = toFieldsLogger(this.logger);
    const jobsOf = groupByEvent(this.routes);
    const outbox = new PgQueueSubscriber(createMillstreamDriver(this.db), {
      pollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
      // A failed relay (Redis down) redelivers the same row in place; don't spin on it.
      resendIntervalMs: 1_000,
      logger: log,
    });

    const router = new Router({ logger: log });
    router.use(recoverer);
    addForwarder(router, {
      handlerName: "outbox-relay",
      forwarderTopic: OUTBOX_TOPIC,
      subscriber: outbox,
      middlewares: [otelMiddleware({ system: "postgresql" })],
      publisher: {
        publish: async (topic, ...messages) => {
          const jobs = jobsOf.get(topic);
          // An event written by a newer version: keep it in the outbox until a process that knows it relays it.
          if (!jobs) throw new Error(`No outbox subscription for ${topic}`);
          await Promise.all(
            messages.flatMap((msg) => {
              const data: OutboxJobData = {
                eventId: msg.uuid,
                correlationId: msg.metadata[CORRELATION_ID],
                payload: jsonEventMarshaler.unmarshal(msg),
              };
              return jobs.map((job) =>
                this.dispatcher.enqueue(job, data, {
                  jobId: `${job}__${msg.uuid}`,
                  attempts: env.DOMAIN_EVENT_JOB_ATTEMPTS,
                  backoffDelay: env.DOMAIN_EVENT_JOB_BACKOFF_MS,
                }),
              );
            }),
          );
        },
        close: async () => {},
      },
      // A row that is not an envelope can never be relayed; it would otherwise block the outbox forever.
      ackWhenCannotUnwrap: true,
    });

    this.router = router;
    this.running = router.run().catch((error: unknown) => this.logger.error({ err: error }, "outbox relay stopped"));
    await router.running;
    this.logger.info({ routes: this.routes.length }, "outbox relay started");
  }

  async close(): Promise<void> {
    if (!this.router) return;
    await this.router.close();
    await this.running;
  }
}

function groupByEvent(routes: readonly EventSubscription[]): Map<string, string[]> {
  const byEvent = new Map<string, string[]>();
  for (const { event, name } of routes) byEvent.set(event.name, [...(byEvent.get(event.name) ?? []), name]);
  return byEvent;
}
