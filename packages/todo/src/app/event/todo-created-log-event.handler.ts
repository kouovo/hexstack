import { singleton } from "@app/common/di";
import type { EventHandler, EventMeta } from "@app/common/events";
import { createLogger } from "@app/common/logger";

import type { TodoCreatedEvent } from "../../domain/todo/events/todo-created.event";

@singleton()
export class TodoCreatedLogEventHandler implements EventHandler<TodoCreatedEvent> {
  private readonly logger = createLogger(TodoCreatedLogEventHandler.name);

  handle(event: TodoCreatedEvent, meta: EventMeta): void {
    this.logger.info({ todoId: event.todoId, title: event.title, eventId: meta.id }, "todo created");
  }
}
