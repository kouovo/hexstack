import {
  DOMAIN_EVENT_JOB_NAME,
  type IOutboxRepository,
  type JobDispatcher,
  type OutboxEventHandlerRegistration,
  type OutboxRelay,
  injectJobDispatcher,
  injectOutboxEventHandlers,
  injectOutboxRepo,
  outboxConsumerJobId,
} from "@app/application";
import { singleton } from "@app/di";
import { env } from "@app/env";

const DEFAULT_BATCH_SIZE = 100;
const PUBLISHED_RETENTION_MS = 7 * 24 * 60 * 60_000;
const CLEANUP_BATCH_SIZE = 1_000;
const MAX_CLEANUP_BATCHES = 100;

/** Transport only. No business handlers run while the database row locks are held. */
@singleton()
export class OutboxRelayService implements OutboxRelay {
  constructor(
    @injectOutboxRepo() private readonly outboxRepo: IOutboxRepository,
    @injectJobDispatcher() private readonly dispatcher: JobDispatcher,
    @injectOutboxEventHandlers() private readonly eventHandlers: OutboxEventHandlerRegistration[],
  ) {}

  async tick(): Promise<number> {
    return this.outboxRepo.publishPending(DEFAULT_BATCH_SIZE, async (entry) => {
      const consumers = this.eventHandlers.filter(({ eventType }) => eventType === entry.eventType);
      if (consumers.length === 0) throw new Error(`No durable consumers for ${entry.eventType}`);
      for (const { consumer } of consumers) {
        await this.dispatcher.enqueue(
          DOMAIN_EVENT_JOB_NAME,
          { entry, consumer },
          {
            jobId: outboxConsumerJobId(entry.id, consumer),
            attempts: env.DOMAIN_EVENT_JOB_ATTEMPTS,
            backoffDelay: env.DOMAIN_EVENT_JOB_BACKOFF_MS,
          },
        );
      }
    });
  }

  async cleanup(): Promise<number> {
    const cutoff = new Date(Date.now() - PUBLISHED_RETENTION_MS);
    let total = 0;
    for (let batch = 0; batch < MAX_CLEANUP_BATCHES; batch += 1) {
      const deleted = await this.outboxRepo.deletePublishedBefore(cutoff, CLEANUP_BATCH_SIZE);
      total += deleted;
      if (deleted < CLEANUP_BATCH_SIZE) break;
    }
    return total;
  }
}
