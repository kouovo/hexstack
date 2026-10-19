import { eventHandler, type IEventHandler } from "@app/cqrs";
import { singleton } from "@app/di";
import { TodoArchivedEvent } from "@app/domain";
import { createLogger } from "@app/logger";

/** In-process, best-effort. TodoArchivedEvent has no durable consumer, so it is never written to the outbox. */
@eventHandler(TodoArchivedEvent)
@singleton()
export class TodoArchivedLogEventHandler implements IEventHandler<TodoArchivedEvent> {
  private readonly logger = createLogger(TodoArchivedLogEventHandler.name);

  handle(event: TodoArchivedEvent): void {
    this.logger.info({ todoId: event.aggregateId, previousStatus: event.previousStatus, eventId: event.id }, "todo archived");
  }
}
