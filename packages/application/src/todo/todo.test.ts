import { TodoCompletedEvent, TodoEntity, type TodoId, type TodoSpecification, type TodoStatusValue, TodoTitle } from "@app/domain";
import { describe, expect, test, vi } from "vitest";

import { uncached } from "../cache/cache.test-helper";
import type { ApplicationTransactionPort } from "../transaction";
import { CompleteTodoCommand, CompleteTodoCommandHandler } from "./commands/complete-todo.command";
import { CreateTodoCommand, CreateTodoCommandHandler } from "./commands/create-todo.command";
import { NOTIFY_TODO_COMPLETED_JOB_NAME, NotifyTodoCompletedJobHandler } from "./jobs/notify-todo-completed.job";
import { ListTodosQuery, ListTodosQueryHandler } from "./queries/list-todos.query";
import { DispatchTodoCompletedOutboxHandler } from "./todo-outbox-handlers";
import type { ITodoRepository } from "./todo.repository.port";

/**
 * In-memory stand-in that honours the same conditional-update contract as the SQL adapter.
 * `status`/`notified` model the stored columns; the entity instance may be mutated ahead of them.
 */
class InMemoryTodoRepository implements ITodoRepository {
  readonly rows = new Map<string, { status: TodoStatusValue; notified: boolean; todo: TodoEntity }>();

  async insert(todo: TodoEntity) {
    this.rows.set(todo.id.value, { status: todo.status.value, notified: false, todo });
  }
  // Specs are evaluated in memory here and translated to SQL by the persistence query visitor.
  async findOne(spec: TodoSpecification) {
    return [...this.rows.values()].map((row) => row.todo).find((todo) => spec.isSatisfiedBy(todo));
  }
  async find(spec: TodoSpecification | undefined, { limit }: { limit: number }) {
    const todos = [...this.rows.values()].map((row) => row.todo);
    return (spec ? todos.filter((todo) => spec.isSatisfiedBy(todo)) : todos).slice(0, limit);
  }
  async updateIfStatus(todo: TodoEntity, expected: TodoStatusValue) {
    const row = this.rows.get(todo.id.value);
    if (!row || row.status !== expected) return false;
    this.rows.set(todo.id.value, { ...row, status: todo.status.value, todo });
    return true;
  }
  async markCompletionNotified(id: TodoId) {
    const row = this.rows.get(id.value);
    if (!row || row.status !== "completed" || row.notified) return false;
    row.notified = true;
    return true;
  }
}

function setup() {
  const repo = new InMemoryTodoRepository();
  const order: string[] = [];
  const transaction: ApplicationTransactionPort = {
    run: async (work) => {
      try {
        const result = await work();
        order.push("commit");
        return result;
      } catch (error) {
        order.push("rollback");
        throw error;
      }
    },
  };
  const outbox = { append: vi.fn(async () => {}) };
  const eventBus = { publishMany: vi.fn(async () => {}) };
  return {
    repo,
    order,
    eventBus,
    outbox,
    create: new CreateTodoCommandHandler(repo, transaction, outbox, eventBus as never),
    complete: new CompleteTodoCommandHandler(repo, transaction, outbox, eventBus as never),
    list: new ListTodosQueryHandler(repo, uncached()),
  };
}

describe("todo use cases", () => {
  test("complete appends TodoCompletedEvent to the outbox inside the transaction", async () => {
    const s = setup();
    const created = await s.create.execute(new CreateTodoCommand({ title: "ship it" }));
    s.outbox.append.mockClear();

    const completed = await s.complete.execute(new CompleteTodoCommand({ todoId: created.id }));

    expect(completed.status).toBe("completed");
    expect(s.outbox.append).toHaveBeenCalledExactlyOnceWith([expect.any(TodoCompletedEvent)]);
  });

  test("unknown todo throws TodoNotFoundError and rolls back", async () => {
    const s = setup();
    await expect(s.complete.execute(new CompleteTodoCommand({ todoId: "todo_missing" }))).rejects.toMatchObject({
      _tag: "TodoNotFoundError",
      todoId: "todo_missing",
    });
    expect(s.order).toEqual(["rollback"]);
  });

  test("completing twice throws TodoTransitionNotAllowedError; no write, outbox row or broadcast", async () => {
    const s = setup();
    const created = await s.create.execute(new CreateTodoCommand({ title: "once" }));
    await s.complete.execute(new CompleteTodoCommand({ todoId: created.id }));
    s.outbox.append.mockClear();
    s.eventBus.publishMany.mockClear();
    const update = vi.spyOn(s.repo, "updateIfStatus");

    await expect(s.complete.execute(new CompleteTodoCommand({ todoId: created.id }))).rejects.toMatchObject({
      _tag: "TodoTransitionNotAllowedError",
      from: "completed",
      to: "completed",
    });
    expect(update).not.toHaveBeenCalled();
    expect(s.outbox.append).not.toHaveBeenCalled();
    expect(s.eventBus.publishMany).not.toHaveBeenCalled();
    expect(s.order.at(-1)).toBe("rollback");
  });

  test("losing the conditional UPDATE race throws TodoModifiedConcurrentlyError; rollback, no outbox append", async () => {
    const s = setup();
    const created = await s.create.execute(new CreateTodoCommand({ title: "race" }));
    s.outbox.append.mockClear();
    vi.spyOn(s.repo, "updateIfStatus").mockResolvedValueOnce(false);
    await expect(s.complete.execute(new CompleteTodoCommand({ todoId: created.id }))).rejects.toMatchObject({
      _tag: "TodoModifiedConcurrentlyError",
      todoId: created.id,
      expectedStatus: "open",
    });
    expect(s.outbox.append).not.toHaveBeenCalled();
    expect(s.order.at(-1)).toBe("rollback");
  });

  test("infrastructure failures are thrown unchanged", async () => {
    const s = setup();
    const created = await s.create.execute(new CreateTodoCommand({ title: "db down" }));
    const failure = new Error("connection terminated");
    vi.spyOn(s.repo, "updateIfStatus").mockRejectedValueOnce(failure);
    await expect(s.complete.execute(new CompleteTodoCommand({ todoId: created.id }))).rejects.toBe(failure);
    expect(s.order.at(-1)).toBe("rollback");
  });
});

describe("list query", () => {
  test("optional status filter becomes a spec; no filter returns everything", async () => {
    const s = setup();
    const a = await s.create.execute(new CreateTodoCommand({ title: "a" }));
    await s.create.execute(new CreateTodoCommand({ title: "b" }));
    await s.complete.execute(new CompleteTodoCommand({ todoId: a.id }));

    expect(await s.list.execute(new ListTodosQuery())).toHaveLength(2);
    expect(await s.list.execute(new ListTodosQuery({ status: "completed" }))).toEqual([expect.objectContaining({ id: a.id })]);
    expect(await s.list.execute(new ListTodosQuery({ status: "archived" }))).toEqual([]);
  });
});

describe("todo async flow", () => {
  test("outbox handler enqueues with a deterministic jobId", async () => {
    const dispatcher = { enqueue: vi.fn(async () => {}), registerJob: vi.fn(), scheduleRepeat: vi.fn() };
    const event = new TodoCompletedEvent({ aggregateId: "todo_1", completedAt: new Date() });
    const handler = new DispatchTodoCompletedOutboxHandler(dispatcher);
    await handler.handle(event);
    await handler.handle(event);
    expect(dispatcher.enqueue).toHaveBeenNthCalledWith(
      1,
      NOTIFY_TODO_COMPLETED_JOB_NAME,
      { todoId: "todo_1" },
      expect.objectContaining({ jobId: "todo-completed__todo_1" }),
    );
    expect(dispatcher.enqueue.mock.calls[1]).toEqual(dispatcher.enqueue.mock.calls[0]);
  });

  test("job handler is idempotent: a redelivered job does not notify twice", async () => {
    const repo = new InMemoryTodoRepository();
    const todo = TodoEntity.create({ title: TodoTitle.create("x") });
    await repo.insert(todo);
    todo.complete();
    await repo.updateIfStatus(todo, "open");
    const spy = vi.spyOn(repo, "markCompletionNotified");

    const job = new NotifyTodoCompletedJobHandler(repo, uncached());
    await job.process({ todoId: todo.id.value });
    await job.process({ todoId: todo.id.value });

    expect(await Promise.all(spy.mock.results.map((r) => r.value))).toEqual([true, false]);
  });
});
