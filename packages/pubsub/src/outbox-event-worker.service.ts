import {
  DOMAIN_EVENT_JOB_NAME,
  type JobDispatcher,
  type OutboxConsumerJob,
  type OutboxEventHandlerRegistration,
  type OutboxEventWorker,
  type OutboxMessage,
  injectJobDispatcher,
  injectOutboxEventHandlers,
} from "@app/application";
import { RehydratedDomainEvent } from "@app/core";
import { singleton } from "@app/di";

/** Executes one durable consumer per BullMQ job; BullMQ owns attempts, backoff and failed-job retention. */
@singleton()
export class OutboxEventWorkerService implements OutboxEventWorker {
  constructor(
    @injectJobDispatcher() private readonly dispatcher: JobDispatcher,
    @injectOutboxEventHandlers() private readonly eventHandlers: OutboxEventHandlerRegistration[],
  ) {}

  registerJobs(): void {
    this.dispatcher.registerJob(DOMAIN_EVENT_JOB_NAME, async (payload) => {
      const { entry, consumer } = payload as OutboxConsumerJob;
      const registration = this.eventHandlers.find(
        (candidate) => candidate.eventType === entry.eventType && candidate.consumer === consumer,
      );
      // Fail visibly on registration/deployment mismatches, never acknowledge a lost consumer.
      if (!registration) throw new Error(`No durable consumer ${consumer} for ${entry.eventType}`);
      await registration.handler.handle(rehydrateEvent(entry));
    });
  }
}

/** Rebuilds the event after the BullMQ JSON boundary (dates arrive as strings). */
export function rehydrateEvent(entry: OutboxMessage): RehydratedDomainEvent {
  const payload = (entry.payload ?? {}) as Record<string, unknown>;
  const storedMeta = payload.metadata as { timestamp?: number; correlationId?: string; causationId?: string } | undefined;
  return new RehydratedDomainEvent({
    id: entry.id,
    aggregateId: entry.aggregateId,
    eventType: entry.eventType,
    metadata: {
      timestamp: storedMeta?.timestamp ?? new Date(entry.createdAt).getTime(),
      correlationId: storedMeta?.correlationId ?? entry.correlationId ?? undefined,
      causationId: storedMeta?.causationId,
    },
    payload,
  });
}
