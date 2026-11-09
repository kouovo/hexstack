import {
  ArchiveTodoCommand,
  ArchiveTodoCommandHandler,
  CompleteTodoCommand,
  CompleteTodoCommandHandler,
  CreateTodoCommand,
  CreateTodoCommandHandler,
  NotifyTodoCompletedJobHandler,
  DomainEventScope,
  type DomainEventPublisher,
  TodoMapper,
} from "@app/application";
import { DomainError } from "@app/core";
import {
  TodoCompletedEvent,
  TodoEntity,
  TodoId,
  TodoIdSpecification,
  TodoStatus,
  TodoStatusSpecification,
  TodoTitle,
  TodoTitleSpecification,
} from "@app/domain";
import { Message } from "@millstream/core";
import { unwrapEnvelope } from "@millstream/forwarder";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

import { TODO_TABLE } from "../db";
import { OUTBOX_TOPIC } from "../millstream";
import { createOutboxEventBus } from "../outbox/domain-event-outbox";
import { createTestDatabase, type TestDatabase } from "../testing/test-database";
import { ApplicationTransactionAdapter } from "../transaction/application-transaction-adapter";
import { TodoRepository } from "./todo.repository";

let db: TestDatabase;
let repo: TodoRepository;
let outbox: DomainEventPublisher;

beforeAll(async () => {
  db = await createTestDatabase();
  repo = new TodoRepository(db.transactions);
  outbox = createOutboxEventBus(db.transactions);
}, 30_000);
beforeEach(async () => {
  await db.pglite.exec(`DELETE FROM ${TODO_TABLE}; DELETE FROM ${OUTBOX_QUEUE_TABLE};`);
});
afterAll(async () => {
  await db?.close();
});

const OUTBOX_QUEUE_TABLE = `millstream_queue_${OUTBOX_TOPIC}`;

type PendingEntry = { id: string; eventName: string; event: Record<string, unknown> };

/** Unrelayed outbox entries, decoded the way the relay does. */
async function pending(): Promise<PendingEntry[]> {
  const { rows } = await db.pglite.query<{ uuid: string; payload: Uint8Array; metadata: Record<string, string> }>(
    `SELECT uuid, payload, metadata FROM ${OUTBOX_QUEUE_TABLE} ORDER BY id`,
  );
  return rows.map((row) => {
    const { destinationTopic, message } = unwrapEnvelope(new Message(row.uuid, Buffer.from(row.payload), row.metadata));
    return {
      id: message.uuid,
      eventName: destinationTopic,
      event: JSON.parse(message.payload.toString("utf8")) as Record<string, unknown>,
    };
  });
}

const noEventBus = { publishMany: async () => [] };

const scope = (target: DomainEventPublisher = outbox) =>
  new DomainEventScope(new ApplicationTransactionAdapter(db.transactions), target, noEventBus);

function handlers() {
  return {
    create: new CreateTodoCommandHandler(repo, scope()),
    complete: new CompleteTodoCommandHandler(repo, scope()),
    archive: new ArchiveTodoCommandHandler(repo, scope()),
  };
}

test("round-trips an entity through the table", async () => {
  const todo = TodoEntity.create(new TodoTitleSpecification(TodoTitle.create("persist me")));
  await repo.insert(todo);
  const loaded = await repo.findOne(new TodoIdSpecification(todo.id));
  expect(loaded?.title.value).toBe("persist me");
  expect(loaded?.status.value).toBe("open");
  expect(await repo.find(undefined, { limit: 10 })).toHaveLength(1);
});

test("toPersistence -> SQL -> toEntity round-trips every column", async () => {
  const at = new Date("2024-01-01T00:00:00.000Z");
  const todo = TodoEntity.create(new TodoTitleSpecification(TodoTitle.create("columns")), at);
  todo.complete(at);
  await repo.insert(todo);
  const loaded = await repo.findOne(new TodoIdSpecification(todo.id));
  expect(TodoMapper.toPersistence(loaded!)).toEqual(TodoMapper.toPersistence(todo));
});

test("specifications are translated to SQL, including and / or / not", async () => {
  const [a, b, c] = ["a", "b", "c"].map((title) => TodoEntity.create(new TodoTitleSpecification(TodoTitle.create(title))));
  for (const todo of [a!, b!, c!]) await repo.insert(todo);
  b!.complete();
  await repo.updateIfStatus(b!, "open");

  const ids = async (spec: Parameters<TodoRepository["find"]>[0]) =>
    (await repo.find(spec, { limit: 10 })).map((todo) => todo.title.value).toSorted();
  const isOpen = new TodoStatusSpecification(TodoStatus.open());
  const isA = new TodoIdSpecification(a!.id);

  expect(await ids(undefined)).toEqual(["a", "b", "c"]);
  expect(await ids(isOpen)).toEqual(["a", "c"]);
  expect(await ids(isOpen.not())).toEqual(["b"]);
  expect(await ids(isOpen.and(isA))).toEqual(["a"]);
  expect(await ids(isA.or(new TodoStatusSpecification(TodoStatus.create("completed"))))).toEqual(["a", "b"]);
  // The same spec evaluated in memory agrees with the SQL translation.
  expect([a!, b!, c!].filter((todo) => isOpen.not().isSatisfiedBy(todo)).map((todo) => todo.title.value)).toEqual(["b"]);
});

test("updateIfStatus only wins against the expected stored status", async () => {
  const todo = TodoEntity.create(new TodoTitleSpecification(TodoTitle.create("race")));
  await repo.insert(todo);
  todo.complete();
  expect(await repo.updateIfStatus(todo, "open")).toBe(true);
  // A stale writer that also loaded the row while it was open now loses.
  expect(await repo.updateIfStatus(todo, "open")).toBe(false);
  expect((await repo.findOne(new TodoIdSpecification(todo.id)))?.status.value).toBe("completed");
});

test("markCompletionNotified succeeds once, and only for completed todos", async () => {
  const todo = TodoEntity.create(new TodoTitleSpecification(TodoTitle.create("notify")));
  await repo.insert(todo);
  expect(await repo.markCompletionNotified(todo.id, new Date())).toBe(false);
  todo.complete();
  await repo.updateIfStatus(todo, "open");
  expect(await repo.markCompletionNotified(todo.id, new Date())).toBe(true);
  expect(await repo.markCompletionNotified(todo.id, new Date())).toBe(false);
});

test("complete commits the todo row and its outbox row together", async () => {
  const { create, complete } = handlers();
  const created = await create.execute(new CreateTodoCommand({ title: "end to end" }));
  // TodoCreatedEvent has no durable consumer, so it is not stored.
  expect(await pending()).toEqual([]);

  await complete.execute(new CompleteTodoCommand({ todoId: created.id }));
  const [entry] = await pending();
  expect(entry).toMatchObject({ id: expect.stringMatching(/^event/), eventName: TodoCompletedEvent.name });
  expect(entry!.event).toEqual({ todoId: created.id, completedAt: expect.any(String) });
});

test("archive persists the status but writes no outbox row (no durable consumer)", async () => {
  const { create, archive } = handlers();
  const created = await create.execute(new CreateTodoCommand({ title: "archive me" }));
  await archive.execute(new ArchiveTodoCommand({ todoId: created.id }));
  expect((await repo.findOne(new TodoIdSpecification(TodoId.create(created.id))))?.status.value).toBe("archived");
  expect(await pending()).toEqual([]);
});

test("a failing outbox insert rolls back the status change", async () => {
  const brokenOutbox = {
    publishMany: async () => {
      throw new Error("outbox down");
    },
  };
  const created = await handlers().create.execute(new CreateTodoCommand({ title: "atomic" }));
  const complete = new CompleteTodoCommandHandler(repo, scope(brokenOutbox));

  await expect(complete.execute(new CompleteTodoCommand({ todoId: created.id }))).rejects.toThrow("outbox down");
  expect((await repo.findOne(new TodoIdSpecification(TodoId.create(created.id))))?.status.value).toBe("open");
});

test("job handler is idempotent against the real table", async () => {
  const { create, complete } = handlers();
  const created = await create.execute(new CreateTodoCommand({ title: "deliver twice" }));
  await complete.execute(new CompleteTodoCommand({ todoId: created.id }));

  const job = new NotifyTodoCompletedJobHandler(repo, {
    get: async () => undefined,
    set: async () => {},
    delete: async () => {},
    bumpVersion: async () => {},
    getOrSet: (_key, load) => load(),
    getOrSetVersioned: (_namespace, load) => load(),
  });
  await job.process({ todoId: created.id });
  const first = (await repo.findOne(new TodoIdSpecification(TodoId.create(created.id))))?.completionNotifiedAt;
  await job.process({ todoId: created.id });
  const second = (await repo.findOne(new TodoIdSpecification(TodoId.create(created.id))))?.completionNotifiedAt;

  expect(first).toBeInstanceOf(Date);
  expect(second).toEqual(first);
});

class ExpectedFailure extends DomainError<"ExpectedFailure"> {
  readonly _tag = "ExpectedFailure";
  readonly kind = "internal";
}

test("a thrown domain error after a write rolls the real transaction back: no todo row, no outbox row", async () => {
  const todo = TodoEntity.create(new TodoTitleSpecification(TodoTitle.create("never committed")));
  todo.clearDomainEvents();
  todo.complete();

  const failure = new ExpectedFailure("rule broken after the write");
  await expect(
    scope().run(async (track) => {
      await repo.insert(todo);
      track(todo);
      throw failure;
    }),
  ).rejects.toBe(failure);
  expect(await repo.findOne(new TodoIdSpecification(todo.id))).toBeUndefined();
  expect(await pending()).toEqual([]);
});

test("completing a completed todo through the real handler throws and leaves the row and outbox untouched", async () => {
  const { create, complete } = handlers();
  const created = await create.execute(new CreateTodoCommand({ title: "complete twice" }));
  await complete.execute(new CompleteTodoCommand({ todoId: created.id }));
  const before = await repo.findOne(new TodoIdSpecification(TodoId.create(created.id)));
  await db.pglite.exec(`DELETE FROM ${OUTBOX_QUEUE_TABLE};`); // relay the first completion

  await expect(complete.execute(new CompleteTodoCommand({ todoId: created.id }))).rejects.toMatchObject({
    _tag: "TodoTransitionNotAllowedError",
    from: "completed",
  });
  const after = await repo.findOne(new TodoIdSpecification(TodoId.create(created.id)));
  expect(after?.updatedAt).toEqual(before?.updatedAt);
  expect(await pending()).toEqual([]);
});
