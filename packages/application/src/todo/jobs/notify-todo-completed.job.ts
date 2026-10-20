import { singleton } from "@app/di";
import { TodoId, todoIdSchema } from "@app/domain";
import { createLogger } from "@app/logger";
import { z } from "@app/zod";

import { type CachePort, injectCache } from "../../cache";
import { jobHandler } from "../../queue/job-handler.decorator";
import { TODO_LIST_CACHE_NAMESPACE } from "../todo-cache-invalidation";
import { type ITodoRepository, injectTodoRepo } from "../todo.repository.port";

export const NOTIFY_TODO_COMPLETED_JOB_NAME = "todo.notify-completed";

export const notifyTodoCompletedJobPayloadSchema = z.object({
  todoId: todoIdSchema,
});

export type NotifyTodoCompletedJobPayload = z.infer<typeof notifyTodoCompletedJobPayloadSchema>;

/** Deterministic job id: BullMQ ignores a second enqueue while the first job is still retained. */
export const notifyTodoCompletedJobId = (todoId: string) => `todo-completed__${todoId}`;

/**
 * Delivery is at-least-once (outbox retries + BullMQ retries), so the handler must be idempotent.
 * The conditional UPDATE is the idempotency gate: only the first run flips completion_notified_at.
 * Put real side effects (email, webhook, …) after a successful claim and give them the same idempotency key.
 */
@jobHandler(NOTIFY_TODO_COMPLETED_JOB_NAME)
@singleton()
export class NotifyTodoCompletedJobHandler {
  private readonly logger = createLogger(NotifyTodoCompletedJobHandler.name);

  constructor(
    @injectTodoRepo() private readonly todoRepo: ITodoRepository,
    @injectCache() private readonly cache: CachePort,
  ) {}

  async process(rawPayload: unknown): Promise<void> {
    const { todoId } = notifyTodoCompletedJobPayloadSchema.parse(rawPayload);
    const claimed = await this.todoRepo.markCompletionNotified(TodoId.create(todoId), new Date());
    if (!claimed) {
      this.logger.debug({ todoId }, "todo completion already notified; skipping duplicate delivery");
      return;
    }
    // This write bypasses command events (no in-process event), so invalidate directly after the SQL statement succeeds.
    await this.cache.bumpVersion(TODO_LIST_CACHE_NAMESPACE);
    this.logger.info({ todoId }, "todo completion notified");
  }
}
