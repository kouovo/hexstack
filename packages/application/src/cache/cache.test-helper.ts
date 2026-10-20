import type { CachePort } from "./cache.port";

/** Tests only: exercise use cases with caching explicitly bypassed. The Keyv adapter has its own tests. */
export function uncached(): CachePort {
  return {
    get: async () => undefined,
    set: async () => {},
    delete: async () => {},
    getOrSet: (_key, load) => load(),
    getOrSetVersioned: (_namespace, load) => load(),
    bumpVersion: async () => {},
  };
}
