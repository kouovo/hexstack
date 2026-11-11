import { inject } from "@app/di";

/** Seconds a negative entry (loader `undefined` / `NotFoundException`) is cached. `emptyTtlSeconds: 0` disables. */
export const CACHE_EMPTY_TTL_SECONDS = 30;

export interface CacheGetOptions {
  /** Log label for this read path. */
  statsType?: string;
  /** Single-flight misses across replicas. */
  lock?: boolean;
  /** Distinguishes filters/limits/cursors under one versioned namespace. Keep it short: hash large inputs. */
  queryKey?: string;
  /** Overrides `CACHE_EMPTY_TTL_SECONDS` for negative entries; `0` disables negative caching. */
  emptyTtlSeconds?: number;
}

/**
 * JSON read cache: cache DTOs, never entities, sessions, password hashes or authorization decisions.
 * `undefined` and `NotFoundException` are cached as short negative entries; other loader errors are not cached.
 * `bumpVersion` (after commit) invalidates a whole versioned namespace without key scans. Store failures fail open.
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
