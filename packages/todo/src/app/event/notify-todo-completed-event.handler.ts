import { type CachePort, injectCache } from "@app/common/cache";
import { singleton } from "@app/common/di";
import type { EventHandler } from "@app/common/events";
import { createLogger } from "@app/common/logger";

import { type ITodoRepository, injectTodoRepo } from "../../adapters/todo.repository";
import type { TodoCompletedEvent } from "../../domain/todo/events/todo-completed.event";
import { TodoId } from "../../domain/todo/todo-id.value-object";
import { TODO_LIST_CACHE_NAMESPACE } from "./todo-list-cache-invalidation.handler";

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
    // This write raises no domain event, so invalidate here. Also on a redelivery: the previous attempt may have
    // claimed and then failed to bump. An extra bump only costs a cache miss.
    await this.cache.bumpVersion(TODO_LIST_CACHE_NAMESPACE);
    if (!claimed) {
      this.logger.debug({ todoId }, "todo completion already notified; skipping duplicate delivery");
      return;
    }
    this.logger.info({ todoId }, "todo completion notified");
  }
}
