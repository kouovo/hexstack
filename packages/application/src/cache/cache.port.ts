import { inject } from "@app/di";

/** Seconds a negative entry (loader `undefined` / `NotFoundException`) is cached. `emptyTtlSeconds: 0` disables. */
export const CACHE_EMPTY_TTL_SECONDS = 30;

export interface CacheGetOptions {
  /** Log label for this read path (e.g. `"todo-list"`). Defaults to `"default"`. */
  statsType?: string;
  /** Single-flight the loader across replicas with the `LockPort` (double-checks the cache after acquiring). */
  lock?: boolean;
  /** Distinguishes filters/limits/cursors under one versioned namespace. Keep it short: hash large inputs. */
  queryKey?: string;
  /** Overrides `CACHE_EMPTY_TTL_SECONDS` for negative entries; `0` disables negative caching. */
  emptyTtlSeconds?: number;
}

/**
 * JSON-compatible read cache (cache DTOs, never entities, sessions, password hashes or authorization decisions).
 *
 * - `getOrSet` caches the loader result. `undefined` and `NotFoundException` are cached as a short negative entry
 *   and replayed on hit; every other loader error propagates and is not cached.
 * - `getOrSetVersioned` stores entries under the namespace's current version. `bumpVersion` (after commit) makes every
 *   entry of that namespace unreachable at once, without key scans; stale entries expire by TTL.
 * - Store failures are fail-open: a read failure is a miss, a write failure leaves the database result untouched.
 */
export interface CachePort {
  get<T>(key: string, options?: CacheGetOptions): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  getOrSet<T>(key: string, loader: () => Promise<T>, ttlSeconds?: number, options?: CacheGetOptions): Promise<T>;

  getOrSetVersioned<T>(namespace: string, loader: () => Promise<T>, ttlSeconds?: number, options?: CacheGetOptions): Promise<T>;
  bumpVersion(namespace: string): Promise<void>;
}

export const CACHE = Symbol.for("CACHE");
export const injectCache = () => inject(CACHE);
