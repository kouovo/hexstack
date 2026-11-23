import { type CachePort, injectCache } from "@app/common/cache";
import { singleton } from "@app/common/di";
import type { EventHandler } from "@app/common/events";

/** Todos are shared for now; owner-scoped reads need a scoped namespace (e.g. `todos:list:${ownerId}`). */
export const TODO_LIST_CACHE_NAMESPACE = "todos:list";

@singleton()
export class TodoListCacheInvalidationHandler implements EventHandler<unknown> {
  constructor(@injectCache() private readonly cache: CachePort) {}

  async handle(): Promise<void> {
    await this.cache.bumpVersion(TODO_LIST_CACHE_NAMESPACE);
  }
}
