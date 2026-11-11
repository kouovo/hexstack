import { singleton } from "@app/di";
import type { TodoCreatedEvent } from "@app/domain";
import { createLogger } from "@app/logger";

import type { EventHandler, EventMeta } from "../../events/subscription";

/** Best effort: anything that must happen belongs in a durable subscription (see ../todo-outbox-handlers.ts). */
@singleton()
export class TodoCreatedLogEventHandler implements EventHandler<TodoCreatedEvent> {
  private readonly logger = createLogger(TodoCreatedLogEventHandler.name);

  handle(event: TodoCreatedEvent, meta: EventMeta): void {
    this.logger.info({ todoId: event.todoId, title: event.title, eventId: meta.id }, "todo created");
  }
}
