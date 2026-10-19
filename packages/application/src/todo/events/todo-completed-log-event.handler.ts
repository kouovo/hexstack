import { eventHandler, type IEventHandler } from "@app/cqrs";
import { singleton } from "@app/di";
import { TodoCompletedEvent } from "@app/domain";
import { createLogger } from "@app/logger";

/** In-process, best-effort. The durable reaction to this event is DispatchTodoCompletedOutboxHandler. */
@eventHandler(TodoCompletedEvent)
@singleton()
export class TodoCompletedLogEventHandler implements IEventHandler<TodoCompletedEvent> {
  private readonly logger = createLogger(TodoCompletedLogEventHandler.name);

  handle(event: TodoCompletedEvent): void {
    this.logger.info({ todoId: event.aggregateId, completedAt: event.completedAt, eventId: event.id }, "todo completed");
  }
}
