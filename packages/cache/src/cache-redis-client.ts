import { type Redis, type RedisOptions, createRedisClient } from "@app/redis";

/**
 * The cache's own connection, with short deadlines, so a Redis outage degrades to misses instead of stalling requests.
 *
 * Commands queue only until the first `ready`; after that the offline queue is disabled and commands fail at once
 * while Redis is unreachable. Without the queue the first commands after boot were rejected before the connection was up
 * ("Stream isn't writeable"), which silently dropped cache invalidations (`bumpVersion`). `commandTimeout` still bounds
 * how long a queued command can wait if Redis is down at boot.
 */
export function createCacheRedisClient(options: RedisOptions): Redis {
  const redis = createRedisClient({
    connectTimeout: 1_000,
    commandTimeout: 250,
    ...options,
    lazyConnect: false,
    enableOfflineQueue: true,
    maxRetriesPerRequest: 0,
  });
  // ioredis reads this option on every command, so switching it here takes effect immediately.
  redis.once("ready", () => {
    redis.options.enableOfflineQueue = false;
  });
  return redis;
}
