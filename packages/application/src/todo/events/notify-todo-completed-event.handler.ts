import { singleton } from "@app/di";
import { type TodoCompletedEvent, TodoId } from "@app/domain";
import { createLogger } from "@app/logger";

import { type CachePort, injectCache } from "../../cache";
import type { EventHandler } from "../../events/subscription";
import { TODO_LIST_CACHE_NAMESPACE } from "../todo-cache-invalidation";
import { type ITodoRepository, injectTodoRepo } from "../todo.repository.port";

/** At-least-once: real side effects (email, webhook…) go after a successful claim, with the same idempotency key. */
@singleton()
export class NotifyTodoCompletedEventHandler implements EventHandler<TodoCompletedEvent> {
  private readonly logger = createLogger(NotifyTodoCompletedEventHandler.name);

  constructor(
    @injectTodoRepo() private readonly todoRepo: ITodoRepository,
    @injectCache() private readonly cache: CachePort,
  ) {}

  async handle({ todoId }: TodoCompletedEvent): Promise<void> {
    const claimed = await this.todoRepo.markCompletionNotified(TodoId.create(todoId), new Date());
    if (!claimed) {
      this.logger.debug({ todoId }, "todo completion already notified; skipping duplicate delivery");
      return;
    }
    // This write raises no domain event, so invalidate here.
    await this.cache.bumpVersion(TODO_LIST_CACHE_NAMESPACE);
    this.logger.info({ todoId }, "todo completion notified");
  }
}
