import { TodoArchivedEvent, TodoCompletedEvent, TodoCreatedEvent } from "@app/domain";

import type { CacheInvalidationEventsHandler } from "../cache/events";

/**
 * Every todo list (any status/limit) is a query key under this one versioned namespace.
 * Todos are currently shared. Owner/tenant-scoped reads need a scoped namespace (e.g. `todos:list:${ownerId}`).
 */
export const TODO_LIST_CACHE_NAMESPACE = "todos:list";

const TODO_EVENTS = [TodoCreatedEvent, TodoCompletedEvent, TodoArchivedEvent] as const;

export function registerTodoCacheInvalidation(handler: CacheInvalidationEventsHandler): void {
  for (const EventClass of TODO_EVENTS) {
    handler.register(EventClass.type, () => [{ kind: "bump", namespace: TODO_LIST_CACHE_NAMESPACE }]);
  }
}
