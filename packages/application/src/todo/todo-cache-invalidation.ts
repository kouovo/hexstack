import { singleton } from "@app/di";

import { type CachePort, injectCache } from "../cache/cache.port";
import type { EventHandler } from "../events/subscription";

/** Todos are shared for now; owner-scoped reads need a scoped namespace (e.g. `todos:list:${ownerId}`). */
export const TODO_LIST_CACHE_NAMESPACE = "todos:list";

@singleton()
export class TodoListCacheInvalidationHandler implements EventHandler<unknown> {
  constructor(@injectCache() private readonly cache: CachePort) {}

  async handle(): Promise<void> {
    await this.cache.bumpVersion(TODO_LIST_CACHE_NAMESPACE);
  }
}
