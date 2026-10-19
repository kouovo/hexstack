import { inject } from "@app/di";

export interface CacheGetOptions {
  /** Distinguishes filters/limits under one versioned invalidation namespace. */
  queryKey?: string;
}

/** Redis-backed, JSON-compatible cache. Same core API as Kouo, without metrics/locking/negative-cache machinery. */
export interface CachePort {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  getOrSet<T>(key: string, loader: () => Promise<T>, ttlSeconds?: number): Promise<T>;
  getOrSetVersioned<T>(namespace: string, loader: () => Promise<T>, ttlSeconds?: number, options?: CacheGetOptions): Promise<T>;
  /** After commit: switch generations, making old entries and late in-flight fills unreachable. */
  bumpVersion(namespace: string): Promise<void>;
}

export const CACHE = Symbol.for("CACHE");
export const injectCache = () => inject(CACHE);
