import { singleton } from "@app/common/di";
import type { EventHandler, EventMeta } from "@app/common/events";
import { createLogger } from "@app/common/logger";

import type { TodoArchivedEvent } from "../../domain/todo/events/todo-archived.event";

@singleton()
export class TodoArchivedLogEventHandler implements EventHandler<TodoArchivedEvent> {
  private readonly logger = createLogger(TodoArchivedLogEventHandler.name);

  handle(event: TodoArchivedEvent, meta: EventMeta): void {
    this.logger.info({ todoId: event.todoId, previousStatus: event.previousStatus, eventId: meta.id }, "todo archived");
  }
}
