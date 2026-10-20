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

/**
 * One persistent key per namespace (`<prefix>:cver:<namespace>`, no TTL). Requires Redis `maxmemory-policy noeviction`
 * (already mandatory for BullMQ): an evicted version key would reset to 0 and could resurrect old entries.
 */
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
    // INCR is not idempotent; an over-bump only costs a later miss (never staleness), so
    // at-least-once redelivery (outbox relay, BullMQ retries) is safe here.
    return this.redis.incr(this.key(namespace));
  }
}
