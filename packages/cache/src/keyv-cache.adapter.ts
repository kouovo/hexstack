import { CACHE_EMPTY_TTL_SECONDS, type CacheGetOptions, type CachePort, type LockPort } from "@app/application";
import { NotFoundException } from "@app/domain";
import { createLogger } from "@app/logger";
import type Keyv from "keyv";

import { InMemoryLockAdapter } from "./lock.adapter";
import { InMemoryVersionStore, type VersionStore } from "./version.store";

/** Longer than a normal list/detail load; the lock auto-extends it while the loader is still running. */
const LOCK_TTL_MS = 5000;

/** Negative entry. Stored as a plain JSON object so it survives Keyv serialization. */
interface EmptySentinel {
  readonly $appCacheEmpty: true;
  readonly notFound?: true;
  readonly message?: string;
}

type Lookup<T> = { outcome: "miss" } | { outcome: "empty"; sentinel: EmptySentinel } | { outcome: "hit"; value: T };

function isEmptySentinel(value: unknown): value is EmptySentinel {
  return typeof value === "object" && value !== null && (value as EmptySentinel).$appCacheEmpty === true;
}

function emptySentinel(err?: NotFoundException): EmptySentinel {
  return err ? { $appCacheEmpty: true, notFound: true, message: err.message } : { $appCacheEmpty: true };
}

function replayEmpty<T>(sentinel: EmptySentinel): T {
  if (sentinel.notFound) throw new NotFoundException(sentinel.message);
  return undefined as T;
}

function emptyTtlSeconds(options?: CacheGetOptions): number {
  return options?.emptyTtlSeconds ?? CACHE_EMPTY_TTL_SECONDS;
}

function errorType(err: unknown): string {
  return err instanceof Error ? err.name : "unknown";
}

/**
 * `CachePort` over Keyv (Redis in production, an in-process Map for `CACHE_DRIVER=memory`/tests).
 *
 * - Hits/misses/negative entries are distinguished by `lookup`; `undefined` and `NotFoundException` are cached briefly.
 * - `lock: true` single-flights a miss across replicas and double-checks the cache after acquiring the lock.
 * - Versioned namespaces: the value key embeds the namespace version; `bumpVersion` increments it (no key scans).
 * - Keyv swallows store errors (emits `error`): a failed read is a miss, a failed write keeps the loaded result.
 *   A failed version read bypasses the cache for that call. Loader errors are never retried here.
 */
export class KeyvCacheAdapter implements CachePort {
  private readonly logger = createLogger(KeyvCacheAdapter.name);

  constructor(
    private readonly keyv: Keyv,
    private readonly versions: VersionStore = new InMemoryVersionStore(),
    private readonly lock: LockPort = new InMemoryLockAdapter(),
  ) {
    this.keyv.on("error", (err: unknown) => {
      // Store/serialization errors can embed cached values; log only the error type.
      this.logger.warn({ errorType: errorType(err) }, "cache store error; treating as miss");
    });
  }

  async get<T>(key: string, options?: CacheGetOptions): Promise<T | undefined> {
    const result = await this.lookup<T>(key, options);
    return result.outcome === "hit" ? result.value : undefined;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttlMs = ttlSeconds && ttlSeconds > 0 ? ttlSeconds * 1000 : undefined;
    await this.keyv.set(key, value, ttlMs);
  }

  async delete(key: string): Promise<void> {
    await this.keyv.delete(key);
  }

  async getOrSet<T>(key: string, loader: () => Promise<T>, ttlSeconds?: number, options?: CacheGetOptions): Promise<T> {
    return this.readThrough(key, loader, ttlSeconds, options, { key });
  }

  async getOrSetVersioned<T>(namespace: string, loader: () => Promise<T>, ttlSeconds?: number, options?: CacheGetOptions): Promise<T> {
    let version: number;
    try {
      version = await this.versions.get(namespace);
    } catch (err) {
      // Without the current version we cannot tell fresh entries from invalidated ones: bypass, never guess.
      this.logger.warn({ errorType: errorType(err), namespace }, "cache version unavailable; loading source");
      return loader();
    }
    const valueKey = options?.queryKey ? `${namespace}:v${version}:${options.queryKey}` : `${namespace}:v${version}`;
    return this.readThrough(valueKey, loader, ttlSeconds, options, { namespace, version, queryKey: options?.queryKey });
  }

  async bumpVersion(namespace: string): Promise<void> {
    const next = await this.versions.incr(namespace);
    this.logger.debug({ namespace, version: next }, "cache version bumped (invalidation)");
  }

  private async readThrough<T>(
    key: string,
    loader: () => Promise<T>,
    ttlSeconds: number | undefined,
    options: CacheGetOptions | undefined,
    logContext: Record<string, unknown>,
  ): Promise<T> {
    const statsType = options?.statsType ?? "default";

    const existing = await this.lookup<T>(key, options);
    if (existing.outcome === "hit") {
      this.logger.debug({ ...logContext, statsType }, "cache hit");
      return existing.value;
    }
    if (existing.outcome === "empty") {
      this.logger.debug({ ...logContext, statsType }, "cache hit (empty)");
      return replayEmpty(existing.sentinel);
    }

    this.logger.debug({ ...logContext, statsType }, "cache miss; loading");
    const result = options?.lock
      ? await this.lockedLoad(key, loader, ttlSeconds, options)
      : await this.plainLoad(key, loader, ttlSeconds, options);
    return result.value;
  }

  private async lookup<T>(key: string, options?: CacheGetOptions): Promise<Lookup<T>> {
    let raw: unknown;
    try {
      raw = await this.keyv.get(key);
    } catch (err) {
      this.logger.warn({ errorType: errorType(err), statsType: options?.statsType ?? "default" }, "cache read failed; treating as miss");
      return { outcome: "miss" };
    }

    if (raw === undefined) return { outcome: "miss" };
    if (isEmptySentinel(raw)) return { outcome: "empty", sentinel: raw };
    return { outcome: "hit", value: raw as T };
  }

  private async plainLoad<T>(
    key: string,
    loader: () => Promise<T>,
    ttlSeconds?: number,
    options?: CacheGetOptions,
  ): Promise<{ value: T; loaded: true }> {
    try {
      const value = await loader();
      await this.writeLoad(key, value, ttlSeconds, options);
      return { value, loaded: true };
    } catch (err) {
      await this.writeEmptyOnNotFound(key, err, options);
      throw err;
    }
  }

  private async lockedLoad<T>(
    key: string,
    loader: () => Promise<T>,
    ttlSeconds?: number,
    options?: CacheGetOptions,
  ): Promise<{ value: T; loaded: boolean }> {
    // Set only once the loader has actually run: its errors must propagate exactly once, never via the fallback.
    let loaderRan = false;
    try {
      return await this.lock.using(`${this.lockPrefix()}cache:lock:${key}`, LOCK_TTL_MS, async (signal) => {
        // Double-check: another replica may have populated the cache while we waited.
        const rechecked = await this.lookup<T>(key, options);
        if (rechecked.outcome === "hit") return { value: rechecked.value, loaded: false };
        if (rechecked.outcome === "empty") return { value: replayEmpty<T>(rechecked.sentinel), loaded: false };
        loaderRan = true;
        try {
          const value = await loader();
          // Don't write if we lost the lock mid-load (auto-extension failed): a newer holder may own the key.
          if (!signal.aborted) await this.writeLoad(key, value, ttlSeconds, options);
          return { value, loaded: true };
        } catch (err) {
          if (!signal.aborted) await this.writeEmptyOnNotFound(key, err, options);
          throw err;
        }
      });
    } catch (err) {
      if (loaderRan || err instanceof NotFoundException) throw err;
      // Contention past the retry budget or a lock-store outage: degrade to an unlocked load, never fail the read.
      this.logger.warn({ errorType: errorType(err) }, "cache lock unavailable; falling back to plain load");
      return this.plainLoad(key, loader, ttlSeconds, options);
    }
  }

  private async writeLoad<T>(key: string, value: T, ttlSeconds?: number, options?: CacheGetOptions): Promise<void> {
    if (value !== undefined) {
      await this.set(key, value, ttlSeconds);
      return;
    }
    const ttl = emptyTtlSeconds(options);
    if (ttl > 0) await this.set(key, emptySentinel(), ttl);
  }

  private async writeEmptyOnNotFound(key: string, err: unknown, options?: CacheGetOptions): Promise<void> {
    const ttl = emptyTtlSeconds(options);
    if (ttl <= 0 || !(err instanceof NotFoundException)) return;
    await this.set(key, emptySentinel(err), ttl);
  }

  private lockPrefix(): string {
    return this.keyv.namespace ? `${this.keyv.namespace}:` : "";
  }
}
