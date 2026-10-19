import { CACHE } from "@app/application";
import { container, instanceCachingFactory } from "@app/di";
import { env } from "@app/env";
import { createRedisClient, getRedisOptions } from "@app/redis";

import { DisabledCacheAdapter, RedisCacheAdapter } from "./redis-cache.adapter";

export function registerCache(): void {
  container.register(CACHE, {
    useFactory: instanceCachingFactory(() => {
      if (!env.CACHE_ENABLED) return new DisabledCacheAdapter();
      // A separate connection with short deadlines: cache outages must not inherit the queue/auth retry policy.
      const redis = createRedisClient({
        ...getRedisOptions(),
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        connectTimeout: 1_000,
        commandTimeout: 250,
      });
      return new RedisCacheAdapter(redis, env.CACHE_KEY_PREFIX);
    }),
  });
}
