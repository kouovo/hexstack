import { eventHandler, type IEventHandler } from "@app/cqrs";
import { singleton } from "@app/di";
import { TodoArchivedEvent, TodoCompletedEvent, TodoCreatedEvent } from "@app/domain";

import { type CachePort, injectCache } from "../../cache";
import { TODO_CACHE_NAMESPACE } from "../todo-cache";

// These handlers run after commit. No wildcard key scans and no invalidation on rollback.
@eventHandler(TodoCreatedEvent)
@singleton()
export class TodoCreatedCacheEventHandler implements IEventHandler<TodoCreatedEvent> {
  constructor(@injectCache() private readonly cache: CachePort) {}
  handle(): Promise<void> {
    return this.cache.bumpVersion(TODO_CACHE_NAMESPACE);
  }
}

@eventHandler(TodoCompletedEvent)
@singleton()
export class TodoCompletedCacheEventHandler implements IEventHandler<TodoCompletedEvent> {
  constructor(@injectCache() private readonly cache: CachePort) {}
  handle(): Promise<void> {
    return this.cache.bumpVersion(TODO_CACHE_NAMESPACE);
  }
}

@eventHandler(TodoArchivedEvent)
@singleton()
export class TodoArchivedCacheEventHandler implements IEventHandler<TodoArchivedEvent> {
  constructor(@injectCache() private readonly cache: CachePort) {}
  handle(): Promise<void> {
    return this.cache.bumpVersion(TODO_CACHE_NAMESPACE);
  }
}
