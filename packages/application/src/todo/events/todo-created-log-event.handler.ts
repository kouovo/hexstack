import { eventHandler, type IEventHandler } from "@app/cqrs";
import { singleton } from "@app/di";
import { TodoCreatedEvent } from "@app/domain";
import { createLogger } from "@app/logger";

/**
 * In-process EventBus consumer: runs after the transaction commits, best-effort, not retried.
 * Good for logging, cache invalidation, realtime fan-out. Anything that must happen belongs in an
 * @outboxHandler instead (see ../todo-outbox-handlers.ts).
 */
@eventHandler(TodoCreatedEvent)
@singleton()
export class TodoCreatedLogEventHandler implements IEventHandler<TodoCreatedEvent> {
  private readonly logger = createLogger(TodoCreatedLogEventHandler.name);

  handle(event: TodoCreatedEvent): void {
    this.logger.info({ todoId: event.aggregateId, title: event.title, eventId: event.id }, "todo created");
  }
}
