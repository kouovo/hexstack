import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

import { createTestDatabase, type TestDatabase } from "./testing";

let db: TestDatabase;
const TABLE = "tx_hooks_test";

beforeAll(async () => {
  db = await createTestDatabase();
  await db.pglite.exec(`CREATE TABLE ${TABLE} (id TEXT PRIMARY KEY)`);
}, 30_000);
beforeEach(async () => {
  await db.pglite.exec(`DELETE FROM ${TABLE}`);
});
afterAll(async () => {
  await db?.close();
});

const insert = (id: string) => sql`INSERT INTO ${sql.table(TABLE)} (id) VALUES (${id})`.execute(db.transactions.getUntypedExecutor());
const rows = async () => (await db.pglite.query<{ id: string }>(`SELECT id FROM ${TABLE} ORDER BY id`)).rows.map(({ id }) => id);

test("before-commit hooks write in the transaction; after-commit hooks run once, after the outermost commit", async () => {
  const log: string[] = [];
  await db.transactions.withTransaction(async () => {
    await db.transactions.withTransaction(async () => {
      const hooks = db.transactions.currentHooks()!;
      hooks.beforeCommit(async () => {
        await insert("before");
        // A hook may register another one.
        db.transactions.currentHooks()!.beforeCommit(() => void log.push("chained"));
      });
      hooks.afterCommit(async () => void log.push(`after:${(await rows()).join(",")}`));
    });
    expect(log).toEqual([]); // the nested call did not commit
    expect(db.transactions.currentHooks()).toBeDefined();
  });
  expect(log).toEqual(["chained", "after:before"]);
  expect(db.transactions.currentHooks()).toBeUndefined();
});

test("a throwing before-commit hook rolls back; after-commit hooks are skipped", async () => {
  const log: string[] = [];
  await expect(
    db.transactions.withTransaction(async () => {
      await insert("rolled-back");
      db.transactions.currentHooks()!.beforeCommit(() => {
        throw new Error("hook failed");
      });
      db.transactions.currentHooks()!.afterCommit(() => void log.push("after"));
    }),
  ).rejects.toThrow("hook failed");
  expect(await rows()).toEqual([]);
  expect(log).toEqual([]);
});

test("a throwing after-commit hook is swallowed: the commit and the result stand, later hooks still run", async () => {
  const log: string[] = [];
  const result = await db.transactions.withTransaction(async () => {
    await insert("kept");
    db.transactions.currentHooks()!.afterCommit(() => {
      throw new Error("broadcast failed");
    });
    db.transactions.currentHooks()!.afterCommit(() => void log.push("second"));
    return 42;
  });
  expect(result).toBe(42);
  expect(await rows()).toEqual(["kept"]);
  expect(log).toEqual(["second"]);
});
