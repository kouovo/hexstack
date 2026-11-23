import { singleton } from "@app/common/di";
import type { EventHandler, EventMeta } from "@app/common/events";
import { createLogger } from "@app/common/logger";

import type { TodoCompletedEvent } from "../../domain/todo/events/todo-completed.event";

@singleton()
export class TodoCompletedLogEventHandler implements EventHandler<TodoCompletedEvent> {
  private readonly logger = createLogger(TodoCompletedLogEventHandler.name);

  handle(event: TodoCompletedEvent, meta: EventMeta): void {
    this.logger.info({ todoId: event.todoId, completedAt: event.completedAt, eventId: meta.id }, "todo completed");
  }
}
