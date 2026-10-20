import type { Redis } from "@app/redis";
import type { KeyvStoreAdapter } from "keyv";

/**
 * Keyv store over the shared ioredis client. Keyv prefixes keys with its namespace (`<namespace>:<key>`) and
 * serializes `{ value, expires }`; this store only moves strings and maps Keyv's millisecond TTL to `PX`.
 */
export class KeyvIoredisStore implements KeyvStoreAdapter {
  opts: Record<string, unknown> = {};
  namespace: string | undefined;

  constructor(private readonly redis: Redis) {}

  async get<Value>(key: string): Promise<Value | undefined> {
    const raw = await this.redis.get(key);
    return raw === null ? undefined : (raw as unknown as Value);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl && ttl > 0) {
      await this.redis.set(key, value, "PX", ttl);
    } else {
      await this.redis.set(key, value);
    }
  }

  async delete(key: string): Promise<boolean> {
    return (await this.redis.del(key)) > 0;
  }

  async has(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }

  /** Operational use only (CLI/tests); request paths invalidate with versions, never with scans. */
  async clear(): Promise<void> {
    const ns = this.namespace;
    if (!ns) throw new Error("Refusing to clear a Keyv store without a namespace (would SCAN the whole Redis database)");
    let cursor = "0";
    do {
      const [next, keys] = await this.redis.scan(cursor, "MATCH", `${ns}:*`, "COUNT", 100);
      cursor = next;
      if (keys.length > 0) await this.redis.unlink(...keys);
    } while (cursor !== "0");
  }

  on(): this {
    return this;
  }
}
