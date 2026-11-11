import type { DomainEventPipeline, EventSubscription, ResolveHandler } from "@app/application";
import { DomainError } from "@app/core";
import { env } from "@app/env";
import { createLogger, toFieldsLogger } from "@app/logger";
import { createMillstreamDriver, type ISqlQueryBuilder, OUTBOX_TOPIC } from "@app/persistence";
import { getRedisOptions } from "@app/redis";
import { BullMQPublisher, BullMQSubscriber, bullmqJob } from "@millstream/bullmq";
import { type Middleware, PermanentError, recoverer, Router } from "@millstream/core";
import { PgQueueSubscriber } from "@millstream/pg";
import type { ConnectionOptions, JobsOptions } from "bullmq";

import { addDomainEventHandlers } from "./domain-event-router";

const jobRetentionOptions = {
  removeOnComplete: { count: 1_000 },
  removeOnFail: { count: 5_000 },
} satisfies JobsOptions;

/** Failures that retrying cannot fix skip the remaining BullMQ attempts and go straight to the failed set. */
export function isPermanentFailure(error: unknown): boolean {
  if (error instanceof PermanentError) return true;
  return error instanceof DomainError && !error.retryable;
}

const discardPermanentFailures: Middleware = (next) => async (msg) => {
  try {
    return await next(msg);
  } catch (error) {
    if (isPermanentFailure(error)) bullmqJob(msg)?.discard();
    throw error;
  }
};

/**
 * outbox → relay → one BullMQ queue per subscription (`<event>.<subscription>`), so each retries and fails on its own.
 * The job id is the event id: a relay crash between publish and delete does not enqueue twice.
 */
export class MillstreamDomainEventPipeline implements DomainEventPipeline {
  private readonly logger = createLogger("domain-event-pipeline");
  private router?: Router;
  private running?: Promise<void>;
  private broker?: BullMQPublisher;

  constructor(
    private readonly db: ISqlQueryBuilder,
    private readonly subscriptions: readonly EventSubscription[],
    private readonly resolve: ResolveHandler,
  ) {}

  async start(): Promise<void> {
    if (this.router) return this.router.running;
    const log = toFieldsLogger(this.logger);
    const redis = getRedisOptions();
    const consumersOf = groupByEvent(this.subscriptions);

    const broker = new BullMQPublisher({
      // Fail fast while Redis is down: the relay keeps the outbox row locked until the publish settles.
      connection: { ...redis, enableOfflineQueue: false, maxRetriesPerRequest: 1 } as unknown as ConnectionOptions,
      consumerGroups: (topic) => consumersOf.get(topic) ?? [],
      jobOptions: () => ({
        attempts: env.DOMAIN_EVENT_JOB_ATTEMPTS,
        backoff: { type: "exponential", delay: env.DOMAIN_EVENT_JOB_BACKOFF_MS },
        ...jobRetentionOptions,
      }),
      logger: log,
    });

    const router = new Router({ logger: log });
    router.use(recoverer);
    addDomainEventHandlers(router, {
      outbox: {
        topic: OUTBOX_TOPIC,
        subscriber: new PgQueueSubscriber(createMillstreamDriver(this.db), {
          pollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
          // A failed relay (Redis down) redelivers the same row in place; don't spin on it.
          resendIntervalMs: 1_000,
          logger: log,
        }),
      },
      broker,
      subscriptions: this.subscriptions,
      consumerSubscriber: ({ handlerName }) =>
        new BullMQSubscriber({ connection: redis as unknown as ConnectionOptions, consumerGroup: handlerName, nack: "fail", logger: log }),
      consumerMiddlewares: [discardPermanentFailures],
      resolve: this.resolve,
    });

    this.router = router;
    this.broker = broker;
    this.running = router.run().catch((error: unknown) => this.logger.error({ err: error }, "domain-event router stopped"));
    await router.running;
    this.logger.info({ subscriptions: this.subscriptions.length }, "domain-event pipeline started");
  }

  async close(): Promise<void> {
    if (!this.router) return;
    await this.router.close();
    await this.running;
    await this.broker?.close();
  }
}

function groupByEvent(subscriptions: readonly EventSubscription[]): Map<string, string[]> {
  const byEvent = new Map<string, string[]>();
  for (const { event, name } of subscriptions) byEvent.set(event.name, [...(byEvent.get(event.name) ?? []), name]);
  return byEvent;
}
