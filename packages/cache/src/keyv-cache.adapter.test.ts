import type { LockPort } from "@app/application";
import { LockContentionError, NotFoundException } from "@app/domain";
import Keyv from "keyv";
import { expect, test, vi } from "vitest";

import { KeyvCacheAdapter } from "./keyv-cache.adapter";
import type { VersionStore } from "./version.store";

function makeCache(overrides: { versions?: VersionStore; lock?: LockPort; keyv?: Keyv } = {}) {
  return new KeyvCacheAdapter(overrides.keyv ?? new Keyv(), overrides.versions, overrides.lock);
}

const isUserNotFound = (err: unknown) => err instanceof NotFoundException && err.message === "User not found";

const counting = <T>(fn: () => Promise<T> | T) => {
  const load = vi.fn(async () => fn());
  return load;
};

test("getOrSet caches a value and skips the loader on hit", async () => {
  const cache = makeCache();
  const load = counting(() => ({ id: "u1" }));

  await expect(cache.getOrSet("users:u1", load, 60)).resolves.toEqual({ id: "u1" });
  await expect(cache.getOrSet("users:u1", load, 60)).resolves.toEqual({ id: "u1" });
  expect(load).toHaveBeenCalledTimes(1);
});

test("entries expire after their TTL", async () => {
  vi.useFakeTimers();
  try {
    const cache = makeCache();
    const load = counting(() => "v");
    await cache.getOrSet("k", load, 1);
    vi.advanceTimersByTime(1_001);
    await cache.getOrSet("k", load, 1);
    expect(load).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

test("getOrSet caches undefined so a missing key does not reload", async () => {
  const cache = makeCache();
  const load = counting(() => undefined);

  await expect(cache.getOrSet("users:missing", load, 60)).resolves.toBeUndefined();
  await expect(cache.getOrSet("users:missing", load, 60)).resolves.toBeUndefined();
  expect(load).toHaveBeenCalledTimes(1);
});

test("getOrSet caches NotFoundException and replays it without reloading", async () => {
  const cache = makeCache();
  const load = counting(() => {
    throw new NotFoundException("User not found");
  });

  await expect(cache.getOrSet("users:ghost", load, 60)).rejects.toSatisfy(isUserNotFound);
  await expect(cache.getOrSet("users:ghost", load, 60)).rejects.toSatisfy(isUserNotFound);
  expect(load).toHaveBeenCalledTimes(1);
});

test("get hides the empty sentinel", async () => {
  const cache = makeCache();
  await cache.getOrSet("users:missing", async () => undefined, 60);
  await expect(cache.get("users:missing")).resolves.toBeUndefined();
});

test("emptyTtlSeconds: 0 disables negative caching for undefined", async () => {
  const cache = makeCache();
  const load = counting(() => undefined);

  await cache.getOrSet("users:missing", load, 60, { emptyTtlSeconds: 0 });
  await cache.getOrSet("users:missing", load, 60, { emptyTtlSeconds: 0 });
  expect(load).toHaveBeenCalledTimes(2);
});

test("emptyTtlSeconds: 0 disables negative caching for NotFoundException", async () => {
  const cache = makeCache();
  const load = counting(() => {
    throw new NotFoundException("User not found");
  });

  await expect(cache.getOrSet("users:ghost", load, 60, { emptyTtlSeconds: 0 })).rejects.toBeInstanceOf(NotFoundException);
  await expect(cache.getOrSet("users:ghost", load, 60, { emptyTtlSeconds: 0 })).rejects.toBeInstanceOf(NotFoundException);
  expect(load).toHaveBeenCalledTimes(2);
});

test("non-NotFound errors are not cached", async () => {
  const cache = makeCache();
  const load = counting(() => {
    throw new Error("db down");
  });

  await expect(cache.getOrSet("users:u1", load, 60)).rejects.toThrow("db down");
  await expect(cache.getOrSet("users:u1", load, 60)).rejects.toThrow("db down");
  expect(load).toHaveBeenCalledTimes(2);
});

test("delete clears a negative entry so the next load runs", async () => {
  const cache = makeCache();
  const load = counting(() => {
    throw new NotFoundException("User not found");
  });

  await expect(cache.getOrSet("users:u1", load, 60)).rejects.toBeInstanceOf(NotFoundException);
  await cache.delete("users:u1");
  await expect(cache.getOrSet("users:u1", load, 60)).rejects.toBeInstanceOf(NotFoundException);
  expect(load).toHaveBeenCalledTimes(2);
});

test("locked getOrSet loads a missing key only once", async () => {
  const cache = makeCache();
  const load = counting(async () => {
    await new Promise((r) => setTimeout(r, 20));
    throw new NotFoundException("User not found");
  });

  const results = await Promise.allSettled([
    cache.getOrSet("users:ghost", load, 60, { lock: true }),
    cache.getOrSet("users:ghost", load, 60, { lock: true }),
  ]);

  expect(results.every((r) => r.status === "rejected" && r.reason instanceof NotFoundException)).toBe(true);
  expect(load).toHaveBeenCalledTimes(1);
});

test("a locked loader failure propagates once and is not retried by the lock fallback", async () => {
  const cache = makeCache();
  const load = counting(() => {
    throw new Error("db down");
  });

  await expect(cache.getOrSet("k", load, 60, { lock: true })).rejects.toThrow("db down");
  expect(load).toHaveBeenCalledTimes(1);
});

test("lock contention degrades to an unlocked load", async () => {
  const lock: LockPort = {
    using: async (resource, ttlMs) => {
      throw new LockContentionError(resource, ttlMs);
    },
  };
  const cache = makeCache({ lock });
  const load = counting(() => "fresh");

  await expect(cache.getOrSet("k", load, 60, { lock: true })).resolves.toBe("fresh");
  await expect(cache.getOrSet("k", load, 60, { lock: true })).resolves.toBe("fresh");
  expect(load).toHaveBeenCalledTimes(1);
});

test("a lost lease returns the loaded value without writing it", async () => {
  const lock: LockPort = {
    using: async (_resource, _ttlMs, fn) => {
      const controller = new AbortController();
      controller.abort();
      return fn(controller.signal);
    },
  };
  const cache = makeCache({ lock });
  const load = counting(() => "value");

  await expect(cache.getOrSet("k", load, 60, { lock: true })).resolves.toBe("value");
  await expect(cache.get("k")).resolves.toBeUndefined();
});

test("getOrSetVersioned separates query keys and bumpVersion invalidates the whole namespace", async () => {
  const cache = makeCache();
  const loadA = counting(() => ["a"]);
  const loadB = counting(() => ["b"]);

  await expect(cache.getOrSetVersioned("todos:list", loadA, 60, { queryKey: "a" })).resolves.toEqual(["a"]);
  await expect(cache.getOrSetVersioned("todos:list", loadB, 60, { queryKey: "b" })).resolves.toEqual(["b"]);
  await cache.getOrSetVersioned("todos:list", loadA, 60, { queryKey: "a" });
  expect(loadA).toHaveBeenCalledTimes(1);

  await cache.bumpVersion("todos:list");
  await cache.getOrSetVersioned("todos:list", loadA, 60, { queryKey: "a" });
  await cache.getOrSetVersioned("todos:list", loadB, 60, { queryKey: "b" });
  expect(loadA).toHaveBeenCalledTimes(2);
  expect(loadB).toHaveBeenCalledTimes(2);
});

test("a fill that started before a bump lands in the old version", async () => {
  const cache = makeCache();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const stale = cache.getOrSetVersioned(
    "todos:list",
    async () => {
      await gate;
      return "stale";
    },
    60,
  );
  await new Promise((r) => setTimeout(r, 0));
  await cache.bumpVersion("todos:list");
  release();
  await expect(stale).resolves.toBe("stale");

  await expect(cache.getOrSetVersioned("todos:list", async () => "fresh", 60)).resolves.toBe("fresh");
});

test("getOrSetVersioned caches NotFoundException", async () => {
  const cache = makeCache();
  const load = counting(() => {
    throw new NotFoundException("Todo not found");
  });

  await expect(cache.getOrSetVersioned("todos:t1", load, 60, { queryKey: "q" })).rejects.toBeInstanceOf(NotFoundException);
  await expect(cache.getOrSetVersioned("todos:t1", load, 60, { queryKey: "q" })).rejects.toBeInstanceOf(NotFoundException);
  expect(load).toHaveBeenCalledTimes(1);
});

test("an unavailable version store bypasses the cache instead of failing the read", async () => {
  const versions: VersionStore = {
    get: async () => {
      throw new Error("redis down");
    },
    incr: async () => 1,
  };
  const cache = makeCache({ versions });
  const load = counting(() => "source");

  await expect(cache.getOrSetVersioned("todos:list", load, 60)).resolves.toBe("source");
  await expect(cache.getOrSetVersioned("todos:list", load, 60)).resolves.toBe("source");
  expect(load).toHaveBeenCalledTimes(2);
});

test("store failures are fail-open: reads miss and writes keep the loaded value", async () => {
  const failing = new Map<string, unknown>();
  failing.get = () => {
    throw new Error("store down");
  };
  failing.set = () => {
    throw new Error("store down");
  };
  const cache = makeCache({ keyv: new Keyv({ store: failing }) });
  const load = counting(() => "source");

  await expect(cache.getOrSet("k", load, 60)).resolves.toBe("source");
  await expect(cache.getOrSet("k", load, 60)).resolves.toBe("source");
  expect(load).toHaveBeenCalledTimes(2);
});
