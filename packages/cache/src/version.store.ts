import type { Redis } from "@app/redis";

/** Monotonic per-namespace cache version. Value keys embed it, so an increment invalidates the whole namespace. */
export interface VersionStore {
  get(namespace: string): Promise<number>;
  incr(namespace: string): Promise<number>;
}

/** Single-process only (`CACHE_DRIVER=memory`, tests). */
export class InMemoryVersionStore implements VersionStore {
  private readonly versions = new Map<string, number>();

  async get(namespace: string): Promise<number> {
    return this.versions.get(namespace) ?? 0;
  }

  async incr(namespace: string): Promise<number> {
    const next = (this.versions.get(namespace) ?? 0) + 1;
    this.versions.set(namespace, next);
    return next;
  }
}

/** Needs Redis `maxmemory-policy noeviction` (as BullMQ does): an evicted version would resurrect old entries. */
export class RedisVersionStore implements VersionStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
  ) {}

  private key(namespace: string): string {
    return `${this.prefix}:cver:${namespace}`;
  }

  async get(namespace: string): Promise<number> {
    const raw = await this.redis.get(this.key(namespace));
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  }

  async incr(namespace: string): Promise<number> {
    // Not idempotent, but an extra bump only costs a miss, so at-least-once redelivery is safe.
    return this.redis.incr(this.key(namespace));
  }
}
