import { singleton } from "@app/di";

import { type CachePort, injectCache } from "../cache/cache.port";
import type { EventHandler } from "../events/subscription";

/**
 * Every todo list (any status/limit) is a query key under this one versioned namespace.
 * Todos are currently shared. Owner/tenant-scoped reads need a scoped namespace (e.g. `todos:list:${ownerId}`).
 */
export const TODO_LIST_CACHE_NAMESPACE = "todos:list";

/**
 * In-process subscription on every todo write event. It runs only after commit, so a rolled-back write never
 * invalidates. Best effort: a failure is logged by the bus and never fails the write; entries expire by TTL.
 */
@singleton()
export class TodoListCacheInvalidationHandler implements EventHandler<unknown> {
  constructor(@injectCache() private readonly cache: CachePort) {}

  async handle(): Promise<void> {
    await this.cache.bumpVersion(TODO_LIST_CACHE_NAMESPACE);
  }
}
