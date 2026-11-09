import { TodoArchivedEvent, TodoCompletedEvent, TodoCreatedEvent, UserRoleChangedEvent } from "@app/domain";

import { TodoArchivedLogEventHandler, TodoCompletedLogEventHandler, TodoCreatedLogEventHandler } from "../todo/events";
import { TodoListCacheInvalidationHandler } from "../todo/todo-cache-invalidation";
import { DispatchTodoCompletedOutboxHandler } from "../todo/todo-outbox-handlers";
import { UserRoleChangedLogEventHandler } from "../user/events";
import { type EventSubscription, subscribe } from "./subscription";

/**
 * In-process, after commit, best effort (millstream MemoryPubSub + dropOnError). Every event is broadcast here.
 * Add one line per (event, handler).
 */
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
 * Durable, at-least-once (outbox → BullMQ, one queue per subscription, BullMQ retries). This list also decides
 * which events are written to the outbox: exactly those with at least one durable subscription.
 */
export const DURABLE_EVENT_SUBSCRIPTIONS: readonly EventSubscription[] = [
  subscribe(TodoCompletedEvent, "todo.dispatch-completion-notification", DispatchTodoCompletedOutboxHandler),
];

export const DURABLE_EVENT_NAMES: ReadonlySet<string> = new Set(DURABLE_EVENT_SUBSCRIPTIONS.map(({ event }) => event.name));
