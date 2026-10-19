import { randomUUID } from "node:crypto";

import type { CacheGetOptions, CachePort } from "@app/application";
import { CacheTtlInvalidError } from "@app/domain";
import { createLogger } from "@app/logger";
import type { Redis } from "@app/redis";

const DEFAULT_TTL_SECONDS = 60;
const READ_VERSION = `
local value = redis.call('GET', KEYS[1])
if value then return value end
redis.call('SET', KEYS[1], ARGV[1])
return ARGV[1]
`;

/** Kouo-style cache API backed directly by Redis. All cached values must be JSON-compatible DTOs. */
export class RedisCacheAdapter implements CachePort {
  private readonly logger = createLogger(RedisCacheAdapter.name);

  constructor(
    private readonly redis: Redis,
    private readonly prefix = "app:cache:",
  ) {}

  private dataKey(key: string): string {
    return `${this.prefix}data:${key}`;
  }
  private versionKey(namespace: string): string {
    return `${this.prefix}version:${namespace}`;
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.redis.get(this.dataKey(key));
      return value === null ? undefined : (JSON.parse(value) as T);
    } catch (error) {
      // JSON.parse and Redis command errors may embed cached values/arguments. Do not log their messages.
      this.logger.warn({ errorType: error instanceof Error ? error.name : "unknown" }, "cache read failed; treating as miss");
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<void> {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) throw new CacheTtlInvalidError(ttlSeconds);
    try {
      const serialized = JSON.stringify(value);
      if (serialized !== undefined) await this.redis.set(this.dataKey(key), serialized, "EX", ttlSeconds);
    } catch (error) {
      this.logger.warn({ errorType: error instanceof Error ? error.name : "unknown" }, "cache fill failed; source result retained");
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(this.dataKey(key));
    } catch (error) {
      this.logger.warn({ errorType: error instanceof Error ? error.name : "unknown" }, "cache delete failed; entry retained until TTL");
    }
  }

  async getOrSet<T>(key: string, loader: () => Promise<T>, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;
    // Never catch/retry the loader: SQL/business errors must propagate exactly once.
    const value = await loader();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async getOrSetVersioned<T>(
    namespace: string,
    loader: () => Promise<T>,
    ttlSeconds = DEFAULT_TTL_SECONDS,
    options?: CacheGetOptions,
  ): Promise<T> {
    let version: string;
    try {
      version = String(await this.redis.eval(READ_VERSION, 1, this.versionKey(namespace), randomUUID()));
    } catch (error) {
      this.logger.warn(
        { errorType: error instanceof Error ? error.name : "unknown", namespace },
        "cache generation unavailable; loading source",
      );
      return loader();
    }
    // JSON tuple prevents key/namespace/query separator collisions. A late fill only writes its old generation.
    return this.getOrSet(JSON.stringify([namespace, version, options?.queryKey ?? null]), loader, ttlSeconds);
  }

  async bumpVersion(namespace: string): Promise<void> {
    try {
      // Random generations also prevent resurrection if Redis evicts ONLY the version key.
      // One persistent version key per namespace; old data keys disappear by TTL, never via KEYS/SCAN.
      await this.redis.set(this.versionKey(namespace), randomUUID());
    } catch (error) {
      this.logger.warn(
        { errorType: error instanceof Error ? error.name : "unknown", namespace },
        "cache invalidation failed; entries retained until TTL",
      );
    }
  }
}

/** Explicit opt-out; production uses Redis, not an implicit process-local cache. */
export class DisabledCacheAdapter implements CachePort {
  async get<T>(_key: string): Promise<T | undefined> {
    return undefined;
  }
  async set<T>(_key: string, _value: T, _ttlSeconds?: number): Promise<void> {}
  async delete(_key: string): Promise<void> {}
  getOrSet<T>(_key: string, loader: () => Promise<T>, _ttlSeconds?: number): Promise<T> {
    return loader();
  }
  getOrSetVersioned<T>(_namespace: string, loader: () => Promise<T>, _ttlSeconds?: number, _options?: CacheGetOptions): Promise<T> {
    return loader();
  }
  async bumpVersion(_namespace: string): Promise<void> {}
}
