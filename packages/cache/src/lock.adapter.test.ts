import { expect, test } from "vitest";

import { InMemoryLockAdapter } from "./lock.adapter";

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
