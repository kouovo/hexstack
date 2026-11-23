import Keyv from "keyv";

import { container, instanceCachingFactory } from "../../di";
import { env } from "../../env";
import { LOCK } from "../../lock/lock.port";
import { InMemoryLockAdapter, RedisLockAdapter } from "../../lock/redis/lock.adapter";
import type { Redis } from "../../redis/client";
import { REDIS_CLIENT } from "../../redis/client";
import { getRedisOptions } from "../../redis/options";
import { CACHE } from "../cache.port";
import { createCacheRedisClient } from "./cache-redis-client";
import { KeyvCacheAdapter } from "./keyv-cache.adapter";
import { KeyvIoredisStore } from "./keyv-ioredis.store";
import { InMemoryVersionStore, RedisVersionStore } from "./version.store";

/** Needs registerRedis(). */
export function registerCache(): void {
  container.register(LOCK, {
    useFactory: instanceCachingFactory(() => new RedisLockAdapter(container.resolve<Redis>(REDIS_CLIENT))),
  });

  container.register(CACHE, {
    useFactory: instanceCachingFactory(() => {
      const namespace = env.CACHE_NAMESPACE;

      if (env.CACHE_DRIVER === "memory") {
        // Replicas share no entries or invalidations: development/single instance only.
        return new KeyvCacheAdapter(new Keyv({ namespace }), new InMemoryVersionStore(), new InMemoryLockAdapter());
      }

      const redis = createCacheRedisClient(getRedisOptions());
      const store = new KeyvIoredisStore(redis);
      return new KeyvCacheAdapter(new Keyv({ store, namespace }), new RedisVersionStore(redis, namespace), new RedisLockAdapter(redis));
    }),
  });
}
