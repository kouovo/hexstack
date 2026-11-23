import type { EventSubscriptions } from "@app/common/events";
import { subscribe } from "@app/common/events";

import { NotifyTodoCompletedEventHandler } from "../app/event/notify-todo-completed-event.handler";
import { TodoArchivedLogEventHandler } from "../app/event/todo-archived-log-event.handler";
import { TodoCompletedLogEventHandler } from "../app/event/todo-completed-log-event.handler";
import { TodoCreatedLogEventHandler } from "../app/event/todo-created-log-event.handler";
import { TodoListCacheInvalidationHandler } from "../app/event/todo-list-cache-invalidation.handler";
import { TodoArchivedEvent } from "../domain/todo/events/todo-archived.event";
import { TodoCompletedEvent } from "../domain/todo/events/todo-completed.event";
import { TodoCreatedEvent } from "../domain/todo/events/todo-created.event";

/** Inbound event port of the todo context: which handler reacts to which event, and how it is delivered. */
export const TODO_SUBSCRIPTIONS = {
  inProcess: [
    subscribe(TodoCreatedEvent, "todo.created.log", TodoCreatedLogEventHandler),
    subscribe(TodoCompletedEvent, "todo.completed.log", TodoCompletedLogEventHandler),
    subscribe(TodoArchivedEvent, "todo.archived.log", TodoArchivedLogEventHandler),
    ...[TodoCreatedEvent, TodoCompletedEvent, TodoArchivedEvent].map((event) =>
      subscribe(event, `todo.list-cache.${event.name}`, TodoListCacheInvalidationHandler),
    ),
  ],
  outbox: [subscribe(TodoCompletedEvent, "todo.notify-completed", NotifyTodoCompletedEventHandler)],
} satisfies EventSubscriptions;
