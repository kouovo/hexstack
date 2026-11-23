import { expect, test } from "vitest";

import { LockContentionError } from "../../errors/common.errors";
import type { Redis } from "../../redis/client";
import { assertLockHeld } from "../lock.port";
import { InMemoryLockAdapter, RedisLockAdapter } from "./lock.adapter";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("using serializes concurrent calls on the same resource", async () => {
  const lock = new InMemoryLockAdapter();
  const order: string[] = [];

  const p1 = lock.using("r", 1000, async () => {
    order.push("1-start");
    await sleep(20);
    order.push("1-end");
    return "a";
  });
  const p2 = lock.using("r", 1000, async () => {
    order.push("2-start");
    await sleep(5);
    order.push("2-end");
    return "b";
  });

  await expect(Promise.all([p1, p2])).resolves.toEqual(["a", "b"]);
  expect(order).toEqual(["1-start", "1-end", "2-start", "2-end"]);
});

test("different resources run concurrently", async () => {
  const lock = new InMemoryLockAdapter();
  const order: string[] = [];

  const p1 = lock.using("r1", 1000, async () => {
    order.push("1-start");
    await sleep(20);
    order.push("1-end");
  });
  const p2 = lock.using("r2", 1000, async () => {
    order.push("2-start");
    await sleep(20);
    order.push("2-end");
  });

  await Promise.all([p1, p2]);
  // Both started before either ended — they ran concurrently.
  expect(order.slice(0, 2)).toEqual(["1-start", "2-start"]);
});

test("a failing holder still releases the lock to the next waiter", async () => {
  const lock = new InMemoryLockAdapter();
  const held: string[] = [];

  const p1 = lock.using("r", 1000, async () => {
    held.push("1");
    await sleep(10);
    throw new Error("boom");
  });
  const p2 = lock.using("r", 1000, async () => {
    held.push("2");
  });

  await expect(p1).rejects.toThrow("boom");
  await p2;
  expect(held).toEqual(["1", "2"]);
});

test("in-memory tryAcquire sees locks held by using and vice versa", async () => {
  const lock = new InMemoryLockAdapter();
  const lease = await lock.tryAcquire("r", 1000);
  expect(lease).toBeDefined();
  await expect(lock.tryAcquire("r", 1000)).resolves.toBeUndefined();

  const order: string[] = [];
  const waiting = lock.using("r", 1000, async () => {
    order.push("using");
  });
  await sleep(5);
  expect(order).toEqual([]);
  await lease!.release();
  await lease!.release(); // idempotent: must not release the next holder
  await waiting;
  expect(order).toEqual(["using"]);
  await expect(lock.tryAcquire("r", 1000)).resolves.toBeDefined();
});

/** Just enough Redis for the lock: SET NX PX, PTTL-style expiry, and the two token-checked scripts. */
class FakeRedis {
  readonly entries = new Map<string, { value: string; expiresAt: number }>();
  private readonly loaded = new Set<string>();
  failing = false;

  private live(key: string) {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt <= Date.now()) this.entries.delete(key);
    return this.entries.get(key);
  }

  async set(key: string, value: string, _px: "PX", ttl: number, _nx: "NX"): Promise<"OK" | null> {
    if (this.failing) throw new Error("Connection is closed.");
    if (this.live(key)) return null;
    this.entries.set(key, { value, expiresAt: Date.now() + ttl });
    return "OK";
  }

  async evalsha(sha: string, _n: number, key: string, token: string, ttl?: number): Promise<number> {
    if (this.failing) throw new Error("Connection is closed.");
    if (!this.loaded.has(sha)) {
      this.loaded.add(sha);
      throw new Error("NOSCRIPT No matching script.");
    }
    return this.apply(ttl, key, token);
  }

  async eval(_source: string, _n: number, key: string, token: string, ttl?: number): Promise<number> {
    return this.apply(ttl, key, token);
  }

  private apply(ttl: number | undefined, key: string, token: string): number {
    const entry = this.live(key);
    if (entry?.value !== token) return 0;
    if (ttl === undefined) this.entries.delete(key);
    else entry.expiresAt = Date.now() + Number(ttl);
    return 1;
  }
}

const redisLock = (fake: FakeRedis, options?: ConstructorParameters<typeof RedisLockAdapter>[1]) =>
  new RedisLockAdapter(fake as unknown as Redis, options);

test("redis using serializes holders and releases the key", async () => {
  const fake = new FakeRedis();
  const lock = redisLock(fake);
  const order: string[] = [];
  const run = (id: string) =>
    lock.using("r", 1000, async () => {
      order.push(`${id}-start`);
      await sleep(20);
      order.push(`${id}-end`);
    });

  await Promise.all([run("1"), run("2")]);
  expect(order).toEqual(["1-start", "1-end", "2-start", "2-end"]);
  expect(fake.entries.size).toBe(0);
});

test("redis using throws LockContentionError after the wait budget", async () => {
  const fake = new FakeRedis();
  const lock = redisLock(fake, { waitTimeoutMs: 60, retryDelayMs: 10 });
  const holder = await lock.tryAcquire("r", 10_000);

  await expect(lock.using("r", 1000, async () => "never")).rejects.toBeInstanceOf(LockContentionError);
  await holder!.release();
});

test("redis store errors propagate at once instead of being retried as contention", async () => {
  const fake = new FakeRedis();
  fake.failing = true;
  const lock = redisLock(fake, { waitTimeoutMs: 10_000 });

  const started = Date.now();
  await expect(lock.using("r", 1000, async () => "never")).rejects.toThrow("Connection is closed.");
  await expect(lock.tryAcquire("r", 1000)).rejects.toThrow("Connection is closed.");
  expect(Date.now() - started).toBeLessThan(100);
});

test("redis using auto-extends the lease while fn runs", async () => {
  const fake = new FakeRedis();
  const lock = redisLock(fake);

  await lock.using("r", 60, async (signal) => {
    await sleep(200);
    expect(signal.aborted).toBe(false);
    expect(fake.entries.has("r")).toBe(true);
  });
  expect(fake.entries.has("r")).toBe(false);
});

test("redis using aborts the signal when the lease is taken over", async () => {
  const fake = new FakeRedis();
  const lock = redisLock(fake);

  await lock.using("r", 60, async (signal) => {
    fake.entries.set("r", { value: "someone-else", expiresAt: Date.now() + 10_000 });
    await sleep(50);
    expect(signal.aborted).toBe(true);
    expect(() => assertLockHeld(signal, "r")).toThrow("Lock lease lost: r");
  });
  // Release is token-checked: the other holder keeps its lease.
  expect(fake.entries.get("r")?.value).toBe("someone-else");
});

test("redis tryAcquire does not wait and release only removes its own token", async () => {
  const fake = new FakeRedis();
  const lock = redisLock(fake);

  const lease = await lock.tryAcquire("r", 1000);
  await expect(lock.tryAcquire("r", 1000)).resolves.toBeUndefined();
  fake.entries.set("r", { value: "someone-else", expiresAt: Date.now() + 10_000 });
  await lease!.release();
  expect(fake.entries.get("r")?.value).toBe("someone-else");
});

test("redis release failures are swallowed (the lease expires by TTL)", async () => {
  const fake = new FakeRedis();
  const lock = redisLock(fake);
  const lease = await lock.tryAcquire("r", 1000);
  fake.failing = true;
  await expect(lease!.release()).resolves.toBeUndefined();
});
