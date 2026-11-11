import { TodoArchivedEvent, TodoCompletedEvent, TodoCreatedEvent, UserRoleChangedEvent } from "@app/domain";

import { TodoArchivedLogEventHandler, TodoCompletedLogEventHandler, TodoCreatedLogEventHandler } from "../todo/events";
import { TodoListCacheInvalidationHandler } from "../todo/todo-cache-invalidation";
import { DispatchTodoCompletedOutboxHandler } from "../todo/todo-outbox-handlers";
import { UserRoleChangedLogEventHandler } from "../user/events";
import { type EventSubscription, subscribe } from "./subscription";

/** After commit, best effort. */
export const IN_PROCESS_EVENT_SUBSCRIPTIONS: readonly EventSubscription[] = [
  subscribe(TodoCreatedEvent, "todo.created.log", TodoCreatedLogEventHandler),
  subscribe(TodoCompletedEvent, "todo.completed.log", TodoCompletedLogEventHandler),
  subscribe(TodoArchivedEvent, "todo.archived.log", TodoArchivedLogEventHandler),
  subscribe(UserRoleChangedEvent, "user.role-changed.log", UserRoleChangedLogEventHandler),
  ...[TodoCreatedEvent, TodoCompletedEvent, TodoArchivedEvent].map((event) =>
    subscribe(event, `todo.list-cache.${event.name}`, TodoListCacheInvalidationHandler),
  ),
];

/** At-least-once. Only events listed here are written to the outbox. */
export const DURABLE_EVENT_SUBSCRIPTIONS: readonly EventSubscription[] = [
  subscribe(TodoCompletedEvent, "todo.dispatch-completion-notification", DispatchTodoCompletedOutboxHandler),
];

export const DURABLE_EVENT_NAMES: ReadonlySet<string> = new Set(DURABLE_EVENT_SUBSCRIPTIONS.map(({ event }) => event.name));
