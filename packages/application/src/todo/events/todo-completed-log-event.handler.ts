import { singleton } from "@app/di";
import type { TodoCompletedEvent } from "@app/domain";
import { createLogger } from "@app/logger";

import type { EventHandler, EventMeta } from "../../events/subscription";

@singleton()
export class TodoCompletedLogEventHandler implements EventHandler<TodoCompletedEvent> {
  private readonly logger = createLogger(TodoCompletedLogEventHandler.name);

  handle(event: TodoCompletedEvent, meta: EventMeta): void {
    this.logger.info({ todoId: event.todoId, completedAt: event.completedAt, eventId: meta.id }, "todo completed");
  }
}
