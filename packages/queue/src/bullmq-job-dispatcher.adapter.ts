import type { EnqueueOptions, JobDispatcher, JobHandler, RegisterJobOptions } from "@app/application";
import { DomainError } from "@app/core";
import { singleton } from "@app/di";
import { createLogger } from "@app/logger";
import type { RedisOptions } from "@app/redis";
import { type ConnectionOptions, type JobsOptions, Queue, UnrecoverableError, Worker } from "bullmq";

import { toBullmqJobId } from "./bullmq-job-id";

const jobRetentionOptions = {
  removeOnComplete: { count: 1_000 },
  removeOnFail: { count: 5_000 },
} satisfies JobsOptions;

@singleton()
export class BullMQJobDispatcher implements JobDispatcher {
  private readonly logger = createLogger(BullMQJobDispatcher.name);
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();

  constructor(
    private readonly connection: RedisOptions,
    private readonly workersEnabled = true,
  ) {}

  async enqueue(name: string, payload: unknown, opts?: EnqueueOptions): Promise<void> {
    const jobOptions: JobsOptions | undefined = opts
      ? {
          jobId: toBullmqJobId(opts.jobId),
          delay: opts.delay,
          deduplication: opts.debounce
            ? {
                id: opts.debounce.id,
                ttl: opts.debounce.ttl,
                extend: true,
                replace: true,
              }
            : undefined,
          attempts: opts.attempts,
          backoff: opts.backoffDelay
            ? {
                type: "exponential",
                delay: opts.backoffDelay,
              }
            : undefined,
          ...jobRetentionOptions,
        }
      : jobRetentionOptions;
    await this.getQueue(name).add(name, payload, jobOptions);
  }

  registerJob(name: string, handler: JobHandler, opts?: RegisterJobOptions): void {
    if (!this.workersEnabled) return;
    if (this.workers.has(name)) {
      throw new Error(`worker already registered for "${name}"`);
    }
    const worker = new Worker(
      name,
      async (job) => {
        try {
          await handler(job.data);
        } catch (error) {
          if (error instanceof DomainError && !error.retryable) {
            const failure = new UnrecoverableError(error.message);
            failure.cause = error;
            throw failure;
          }
          throw error;
        }
      },
      {
        connection: this.connection as unknown as ConnectionOptions,
        concurrency: opts?.concurrency ?? 1,
      },
    );
    worker.on("failed", (job, err) => {
      this.logger.error({ err, name, jobId: job?.id, attemptsMade: job?.attemptsMade }, "bullmq job failed");
    });
    worker.on("error", (err) => {
      this.logger.error({ err, name }, "bullmq worker error");
    });
    this.workers.set(name, worker);
  }

  async scheduleRepeat(name: string, intervalMs: number): Promise<void> {
    await this.getQueue(name).upsertJobScheduler(
      name,
      { every: intervalMs },
      {
        name,
        data: {},
        opts: jobRetentionOptions,
      },
    );
    this.logger.debug({ name, intervalMs }, "bullmq repeat job scheduled");
  }

  private getQueue(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        // Producers must fail when Redis is unavailable instead of buffering indefinitely.
        // In particular, the outbox relay holds database row locks until enqueue settles.
        connection: { ...this.connection, enableOfflineQueue: false, maxRetriesPerRequest: 1 } as unknown as ConnectionOptions,
      });
      this.queues.set(name, queue);
    }
    return queue;
  }
}
