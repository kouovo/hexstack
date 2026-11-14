import { CACHE_EMPTY_TTL_SECONDS, type CacheGetOptions, type CachePort, type LockPort } from "@app/application";
import { NotFoundException } from "@app/domain";
import { createLogger } from "@app/logger";
import type { Span } from "@opentelemetry/api";
import type Keyv from "keyv";

import { type CacheOutcome, cacheTelemetry, withCacheSpan } from "./cache.telemetry";
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

function statsTypeOf(options?: CacheGetOptions): string {
  return options?.statsType ?? "default";
}

/** A replayed/cached NotFoundException is a normal cache answer, not a failed span. */
const isExpectedError = (err: unknown) => err instanceof NotFoundException;

/** Keyv swallows store errors (emits `error`): a failed read is a miss, a failed write keeps the loaded result. */
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
      cacheTelemetry.error("store", errorType(err));
    });
  }

  async get<T>(key: string, options?: CacheGetOptions): Promise<T | undefined> {
    const result = await this.lookup<T>(key, options);
    cacheTelemetry.request(statsTypeOf(options), result.outcome);
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
    return withCacheSpan(
      `cache.get_or_set ${statsTypeOf(options)}`,
      this.spanAttributes(options),
      (span) => this.readThrough(key, loader, ttlSeconds, options, { key }, span),
      isExpectedError,
    );
  }

  async getOrSetVersioned<T>(namespace: string, loader: () => Promise<T>, ttlSeconds?: number, options?: CacheGetOptions): Promise<T> {
    return withCacheSpan(
      `cache.get_or_set ${statsTypeOf(options)}`,
      { ...this.spanAttributes(options), "cache.namespace": namespace },
      async (span) => {
        let version: number;
        try {
          version = await this.versions.get(namespace);
        } catch (err) {
          // Without the current version we cannot tell fresh entries from invalidated ones: bypass, never guess.
          this.logger.warn({ errorType: errorType(err), namespace }, "cache version unavailable; loading source");
          cacheTelemetry.error("version", errorType(err));
          this.recordOutcome(span, options, "bypass");
          return loader();
        }
        const valueKey = options?.queryKey ? `${namespace}:v${version}:${options.queryKey}` : `${namespace}:v${version}`;
        return this.readThrough(valueKey, loader, ttlSeconds, options, { namespace, version, queryKey: options?.queryKey }, span);
      },
      isExpectedError,
    );
  }

  async bumpVersion(namespace: string): Promise<void> {
    let next: number;
    try {
      next = await this.versions.incr(namespace);
    } catch (err) {
      cacheTelemetry.error("invalidate", errorType(err));
      throw err;
    }
    cacheTelemetry.invalidation(namespace);
    this.logger.debug({ namespace, version: next }, "cache version bumped (invalidation)");
  }

  private async readThrough<T>(
    key: string,
    loader: () => Promise<T>,
    ttlSeconds: number | undefined,
    options: CacheGetOptions | undefined,
    logContext: Record<string, unknown>,
    span?: Span,
  ): Promise<T> {
    const statsType = statsTypeOf(options);

    const existing = await this.lookup<T>(key, options);
    if (existing.outcome === "hit") {
      this.logger.debug({ ...logContext, statsType }, "cache hit");
      this.recordOutcome(span, options, "hit");
      return existing.value;
    }
    if (existing.outcome === "empty") {
      this.logger.debug({ ...logContext, statsType }, "cache hit (empty)");
      this.recordOutcome(span, options, "empty");
      return replayEmpty(existing.sentinel);
    }

    this.logger.debug({ ...logContext, statsType }, "cache miss; loading");
    let loaderRan = false;
    const timedLoader = async (): Promise<T> => {
      loaderRan = true;
      const started = performance.now();
      let result: "ok" | "not_found" | "error" = "error";
      try {
        const value = await loader();
        result = "ok";
        return value;
      } catch (err) {
        if (err instanceof NotFoundException) result = "not_found";
        throw err;
      } finally {
        cacheTelemetry.load(statsType, (performance.now() - started) / 1000, result);
      }
    };
    try {
      const result = options?.lock
        ? await this.lockedLoad(key, timedLoader, ttlSeconds, options)
        : await this.plainLoad(key, timedLoader, ttlSeconds, options);
      return result.value;
    } finally {
      // Not run: another replica filled the entry while we waited for the lock.
      this.recordOutcome(span, options, loaderRan ? "miss" : "coalesced");
    }
  }

  private spanAttributes(options?: CacheGetOptions): Record<string, string | boolean> {
    return { "cache.type": statsTypeOf(options), "cache.lock": options?.lock ?? false };
  }

  private recordOutcome(span: Span | undefined, options: CacheGetOptions | undefined, outcome: CacheOutcome): void {
    span?.setAttribute("cache.outcome", outcome);
    cacheTelemetry.request(statsTypeOf(options), outcome);
  }

  private async lookup<T>(key: string, options?: CacheGetOptions): Promise<Lookup<T>> {
    let raw: unknown;
    try {
      raw = await this.keyv.get(key);
    } catch (err) {
      this.logger.warn({ errorType: errorType(err), statsType: statsTypeOf(options) }, "cache read failed; treating as miss");
      cacheTelemetry.error("read", errorType(err));
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
      cacheTelemetry.lockFallback(statsTypeOf(options));
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
