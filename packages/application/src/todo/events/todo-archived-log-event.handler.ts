import { singleton } from "@app/di";
import type { TodoArchivedEvent } from "@app/domain";
import { createLogger } from "@app/logger";

import type { EventHandler, EventMeta } from "../../events/subscription";

@singleton()
export class TodoArchivedLogEventHandler implements EventHandler<TodoArchivedEvent> {
  private readonly logger = createLogger(TodoArchivedLogEventHandler.name);

  handle(event: TodoArchivedEvent, meta: EventMeta): void {
    this.logger.info({ todoId: event.todoId, previousStatus: event.previousStatus, eventId: meta.id }, "todo archived");
  }
}
