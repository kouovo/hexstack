import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TodoCompletedEvent } from "@app/domain";
import { PGlite } from "@electric-sql/pglite";
import { Message } from "@millstream/core";
import { parseEvent } from "@millstream/cqrs";
import { unwrapEnvelope } from "@millstream/forwarder";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, expect, test } from "vitest";

import { MIGRATIONS_FOLDER } from "../testing/test-database";

const MILLSTREAM_MIGRATION = "0003_millstream_outbox";
const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** The migrations folder as it was before `tag` (journal truncated). */
function migrationsBefore(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), "migrations-"));
  dirs.push(dir);
  cpSync(MIGRATIONS_FOLDER, dir, { recursive: true });
  const journalPath = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  journal.entries = journal.entries.slice(
    0,
    journal.entries.findIndex((entry) => entry.tag === tag),
  );
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

/** The old payload: the whole serialized event class. */
const old = (id: string, todoId: string) =>
  JSON.stringify({
    id,
    aggregateId: todoId,
    eventType: "TodoCompletedEvent",
    metadata: { timestamp: 1 },
    completedAt: "2024-01-01T00:00:00.000Z",
  });

test("0003 moves unpublished app_outbox rows into the millstream outbox as relayable todo.completed.v1 events", async () => {
  const pglite = new PGlite();
  try {
    await migrate(drizzle(pglite), { migrationsFolder: migrationsBefore(MILLSTREAM_MIGRATION) });
    await pglite.query(
      `INSERT INTO app_outbox (id, aggregate_type, aggregate_id, event_type, payload, correlation_id, published_at) VALUES
        ('evt_1', 'todo', 'todo_1', 'TodoCompletedEvent', $1::jsonb, NULL, now()),
        ('evt_2', 'todo', 'todo_2', 'TodoCompletedEvent', $2::jsonb, 'c2', NULL),
        ('evt_3', 'todo', 'todo_3', 'TodoCompletedEvent', $3::jsonb, NULL, NULL)`,
      [old("evt_1", "todo_1"), old("evt_2", "todo_2"), old("evt_3", "todo_3")],
    );

    await migrate(drizzle(pglite), { migrationsFolder: MIGRATIONS_FOLDER });

    const { rows } = await pglite.query<{ uuid: string; payload: Uint8Array; metadata: Record<string, string> }>(
      "SELECT uuid, payload, metadata FROM millstream_queue_outbox ORDER BY id",
    );
    const relayed = rows.map((row) => unwrapEnvelope(new Message(row.uuid, Buffer.from(row.payload), row.metadata)));
    // Already-published rows are done; pending ones keep their order and id.
    expect(relayed.map(({ message }) => message.uuid)).toEqual(["evt_2", "evt_3"]);
    expect(relayed.map(({ destinationTopic }) => destinationTopic)).toEqual([TodoCompletedEvent.name, TodoCompletedEvent.name]);
    expect(relayed[0]!.message.metadata).toEqual({ name: TodoCompletedEvent.name, correlation_id: "c2" });
    expect(relayed[1]!.message.metadata).toEqual({ name: TodoCompletedEvent.name });
    // The payload is what the durable subscription's schema accepts.
    const payload = await parseEvent(TodoCompletedEvent, JSON.parse(relayed[0]!.message.payload.toString("utf8")));
    expect(payload).toEqual({ todoId: "todo_2", completedAt: new Date("2024-01-01T00:00:00.000Z") });

    const { rows: tables } = await pglite.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'app_outbox'");
    expect(tables).toEqual([]);
  } finally {
    await pglite.close();
  }
});
