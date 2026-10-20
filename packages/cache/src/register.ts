import { CACHE, LOCK } from "@app/application";
import { container, instanceCachingFactory } from "@app/di";
import { env } from "@app/env";
import { REDIS_CLIENT, type Redis, createRedisClient, getRedisOptions } from "@app/redis";
import Keyv from "keyv";

import { KeyvCacheAdapter } from "./keyv-cache.adapter";
import { KeyvIoredisStore } from "./keyv-ioredis.store";
import { InMemoryLockAdapter, RedisLockAdapter } from "./lock.adapter";
import { InMemoryVersionStore, RedisVersionStore } from "./version.store";

/**
 * Binds LOCK (general-purpose Redis lock on the shared client) and CACHE. Needs registerRedis().
 */
export function registerCache(): void {
  container.register(LOCK, {
    useFactory: instanceCachingFactory(() => new RedisLockAdapter(container.resolve<Redis>(REDIS_CLIENT))),
  });

  container.register(CACHE, {
    useFactory: instanceCachingFactory(() => {
      const namespace = env.CACHE_NAMESPACE;

      if (env.CACHE_DRIVER === "memory") {
        // Process-local: replicas do not share entries or invalidations. Development/single-instance only.
        return new KeyvCacheAdapter(new Keyv({ namespace }), new InMemoryVersionStore(), new InMemoryLockAdapter());
      }

      // A dedicated connection with short deadlines: cache outages degrade to misses instead of
      // inheriting the queue/auth retry policy and stalling requests.
      const redis = createRedisClient({
        ...getRedisOptions(),
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        connectTimeout: 1_000,
        commandTimeout: 250,
      });
      const store = new KeyvIoredisStore(redis);
      return new KeyvCacheAdapter(new Keyv({ store, namespace }), new RedisVersionStore(redis, namespace), new RedisLockAdapter(redis));
    }),
  });
}
