import {
  ArchiveTodoCommand,
  ArchiveTodoCommandHandler,
  CompleteTodoCommand,
  CompleteTodoCommandHandler,
  CreateTodoCommand,
  CreateTodoCommandHandler,
  NotifyTodoCompletedJobHandler,
  type OutboxMessage,
  OutboxService,
  runWithDomainEvents,
  TodoMapper,
} from "@app/application";
import { DomainError } from "@app/core";
import { TodoEntity, TodoId, TodoIdSpecification, TodoStatus, TodoStatusSpecification, TodoTitle } from "@app/domain";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

import { OUTBOX_TABLE, TODO_TABLE } from "../db";
import { OutboxRepository } from "../outbox/outbox.repository";
import { createTestDatabase, type TestDatabase } from "../testing/test-database";
import { ApplicationTransactionAdapter } from "../transaction/application-transaction-adapter";
import { TodoRepository } from "./todo.repository";

let db: TestDatabase;
let repo: TodoRepository;
let outboxRepo: OutboxRepository;

beforeAll(async () => {
  db = await createTestDatabase();
  repo = new TodoRepository(db.transactions);
  outboxRepo = new OutboxRepository(db.transactions);
}, 30_000);
beforeEach(async () => {
  await db.pglite.exec(`DELETE FROM ${TODO_TABLE}; DELETE FROM ${OUTBOX_TABLE};`);
});
afterAll(async () => {
  await db?.close();
});

async function pending(): Promise<OutboxMessage[]> {
  const entries: OutboxMessage[] = [];
  await outboxRepo.publishPending(10, async (entry) => void entries.push(entry));
  return entries;
}

const noEventBus = { publishMany: async () => {} } as never;

function handlers() {
  const transaction = new ApplicationTransactionAdapter(db.transactions);
  const outbox = new OutboxService(outboxRepo);
  return {
    create: new CreateTodoCommandHandler(repo, transaction, outbox, noEventBus),
    complete: new CompleteTodoCommandHandler(repo, transaction, outbox, noEventBus),
    archive: new ArchiveTodoCommandHandler(repo, transaction, outbox, noEventBus),
  };
}

test("round-trips an entity through the table", async () => {
  const todo = TodoEntity.create({ title: TodoTitle.create("persist me") });
  await repo.insert(todo);
  const loaded = await repo.findOne(new TodoIdSpecification(todo.id));
  expect(loaded?.title.value).toBe("persist me");
  expect(loaded?.status.value).toBe("open");
  expect(await repo.find(undefined, { limit: 10 })).toHaveLength(1);
});

test("toPersistence -> SQL -> toEntity round-trips every column", async () => {
  const at = new Date("2024-01-01T00:00:00.000Z");
  const todo = TodoEntity.create({ title: TodoTitle.create("columns"), createdAt: at });
  todo.complete(at);
  await repo.insert(todo);
  const loaded = await repo.findOne(new TodoIdSpecification(todo.id));
  expect(TodoMapper.toPersistence(loaded!)).toEqual(TodoMapper.toPersistence(todo));
});

test("specifications are translated to SQL, including and / or / not", async () => {
  const [a, b, c] = ["a", "b", "c"].map((title) => TodoEntity.create({ title: TodoTitle.create(title) }));
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
  const todo = TodoEntity.create({ title: TodoTitle.create("race") });
  await repo.insert(todo);
  todo.complete();
  expect(await repo.updateIfStatus(todo, "open")).toBe(true);
  // A stale writer that also loaded the row while it was open now loses.
  expect(await repo.updateIfStatus(todo, "open")).toBe(false);
  expect((await repo.findOne(new TodoIdSpecification(todo.id)))?.status.value).toBe("completed");
});

test("markCompletionNotified succeeds once, and only for completed todos", async () => {
  const todo = TodoEntity.create({ title: TodoTitle.create("notify") });
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
  expect(entry).toMatchObject({ aggregateType: "todo", aggregateId: created.id, eventType: "TodoCompletedEvent" });
});

test("archive persists the status but writes no outbox row (no durable consumer)", async () => {
  const { create, archive } = handlers();
  const created = await create.execute(new CreateTodoCommand({ title: "archive me" }));
  await archive.execute(new ArchiveTodoCommand({ todoId: created.id }));
  expect((await repo.findOne(new TodoIdSpecification(TodoId.create(created.id))))?.status.value).toBe("archived");
  const { count } = await db.queryBuilder
    .selectFrom(OUTBOX_TABLE)
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .executeTakeFirstOrThrow();
  expect(Number(count)).toBe(0);
});

test("a failing outbox insert rolls back the status change", async () => {
  const transaction = new ApplicationTransactionAdapter(db.transactions);
  const brokenOutbox = new OutboxService({
    insert: async () => {
      throw new Error("outbox down");
    },
  } as never);
  const created = await handlers().create.execute(new CreateTodoCommand({ title: "atomic" }));
  const complete = new CompleteTodoCommandHandler(repo, transaction, brokenOutbox, noEventBus);

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
  const transaction = new ApplicationTransactionAdapter(db.transactions);
  const outbox = new OutboxService(outboxRepo);
  const todo = TodoEntity.create({ title: TodoTitle.create("never committed") });
  todo.clearDomainEvents();
  todo.complete();

  const failure = new ExpectedFailure("rule broken after the write");
  await expect(
    runWithDomainEvents(transaction, outbox, noEventBus, async () => {
      await repo.insert(todo);
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
  await outboxRepo.publishPending(10, async () => {}); // drain the first completion

  await expect(complete.execute(new CompleteTodoCommand({ todoId: created.id }))).rejects.toMatchObject({
    _tag: "TodoTransitionNotAllowedError",
    from: "completed",
  });
  const after = await repo.findOne(new TodoIdSpecification(TodoId.create(created.id)));
  expect(after?.updatedAt).toEqual(before?.updatedAt);
  expect(await pending()).toEqual([]);
});
