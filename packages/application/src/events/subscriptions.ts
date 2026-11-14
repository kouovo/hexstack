import { TodoArchivedEvent, TodoCompletedEvent, TodoCreatedEvent, UserRoleChangedEvent } from "@app/domain";

import {
  NotifyTodoCompletedEventHandler,
  TodoArchivedLogEventHandler,
  TodoCompletedLogEventHandler,
  TodoCreatedLogEventHandler,
} from "../todo/events";
import { TodoListCacheInvalidationHandler } from "../todo/todo-cache-invalidation";
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

/**
 * At-least-once, so handlers must be idempotent. Only events listed here are persisted.
 * The name is the BullMQ queue name: keep it stable.
 */
export const OUTBOX_SUBSCRIPTIONS: readonly EventSubscription[] = [
  subscribe(TodoCompletedEvent, "todo.notify-completed", NotifyTodoCompletedEventHandler),
];

export const OUTBOX_EVENT_NAMES: ReadonlySet<string> = new Set(OUTBOX_SUBSCRIPTIONS.map(({ event }) => event.name));
