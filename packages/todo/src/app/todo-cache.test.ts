import { uncached } from "@app/common/cache/testing";
import { DomainEventScope } from "@app/common/cqrs";
import type { ApplicationTransactionPort } from "@app/common/cqrs";
import { createInProcessEventBus } from "@app/common/events";
import { outboxEventNames } from "@app/common/events";
import { expect, test, vi } from "vitest";

import type { ITodoRepository } from "../adapters/todo.repository";
import type { TodoEntity } from "../domain/todo/todo.entity";
import { TODO_SUBSCRIPTIONS } from "../ports/events";
import { ArchiveTodoCommandHandler } from "./command/archive-todo.command";
import { CompleteTodoCommandHandler } from "./command/complete-todo.command";
import { CreateTodoCommandHandler } from "./command/create-todo.command";
import { NotifyTodoCompletedEventHandler } from "./event/notify-todo-completed-event.handler";
import { TODO_LIST_CACHE_NAMESPACE, TodoListCacheInvalidationHandler } from "./event/todo-list-cache-invalidation.handler";
import { ListTodosQueryHandler } from "./query/list-todos.query";
import { todoListQueryKey } from "./todo-list-cache-key";

function setup() {
  const cache = uncached();
  const order: string[] = [];
  const invalidate = vi.spyOn(cache, "bumpVersion").mockImplementation(async () => {
    order.push("invalidate");
  });
  const remember = vi.spyOn(cache, "getOrSetVersioned");
  const rows = new Map<string, TodoEntity>();
  let notified = false;
  const repo: ITodoRepository = {
    insert: async (todo) => {
      rows.set(todo.id.value, todo);
    },
    findOne: async (spec) => [...rows.values()].find((todo) => spec.isSatisfiedBy(todo)),
    find: async (spec, { limit }) => [...rows.values()].filter((todo) => !spec || spec.isSatisfiedBy(todo)).slice(0, limit),
    updateIfStatus: async () => true,
    markCompletionNotified: async () => {
      if (notified) return false;
      notified = true;
      return true;
    },
  };
  const transaction: ApplicationTransactionPort = {
    run: async (work) => {
      const result = await work();
      order.push("commit");
      return result;
    },
  };
  const outbox = { publishMany: vi.fn(async () => []) };

  // The real millstream in-process bus with the app's cache-invalidation subscriptions, on this test's cache.
  const invalidation = new TodoListCacheInvalidationHandler(cache);
  const subscriptions = TODO_SUBSCRIPTIONS.inProcess.filter(({ handler }) => handler === TodoListCacheInvalidationHandler);
  const { bus } = createInProcessEventBus(subscriptions, () => invalidation as never);
  const scope = new DomainEventScope(transaction, outbox, bus, outboxEventNames(TODO_SUBSCRIPTIONS));

  return {
    cache,
    invalidate,
    remember,
    order,
    outbox,
    create: new CreateTodoCommandHandler(repo, scope),
    complete: new CompleteTodoCommandHandler(repo, scope),
    archive: new ArchiveTodoCommandHandler(repo, scope),
    list: new ListTodosQueryHandler(repo, cache),
    notify: new NotifyTodoCompletedEventHandler(repo, cache),
  };
}

test("all todo writes bump the shared list namespace, only after commit", async () => {
  const s = setup();
  const todo = await s.create.execute({ title: "cached" });
  await s.complete.execute({ todoId: todo.id });
  await s.archive.execute({ todoId: todo.id });
  expect(s.order).toEqual(["commit", "invalidate", "commit", "invalidate", "commit", "invalidate"]);
  expect(s.invalidate.mock.calls).toEqual([[TODO_LIST_CACHE_NAMESPACE], [TODO_LIST_CACHE_NAMESPACE], [TODO_LIST_CACHE_NAMESPACE]]);
});

test("a failed transaction does not invalidate; a failing invalidation cannot fail a committed write", async () => {
  const s = setup();
  const todo = await s.create.execute({ title: "rollback" });
  s.invalidate.mockClear();
  // TodoCompletedEvent is durable, so completing writes the outbox inside the transaction; make that fail.
  s.outbox.publishMany.mockRejectedValueOnce(new Error("outbox failed"));
  await expect(s.complete.execute({ todoId: todo.id })).rejects.toThrow("outbox failed");
  expect(s.invalidate).not.toHaveBeenCalled();
  s.invalidate.mockRejectedValueOnce(new Error("cache failed"));
  await expect(s.create.execute({ title: "committed" })).resolves.toMatchObject({ title: "committed" });
});

test("a thrown domain error commits nothing, so it does not invalidate the cache", async () => {
  const s = setup();
  const todo = await s.create.execute({ title: "archive twice" });
  await s.archive.execute({ todoId: todo.id });
  s.invalidate.mockClear();
  await expect(s.archive.execute({ todoId: todo.id })).rejects.toMatchObject({
    _tag: "TodoTransitionNotAllowedError",
  });
  expect(s.invalidate).not.toHaveBeenCalled();
});

test("list reads are versioned, locked, labelled and keyed by every filter/limit; cached values are DTOs", async () => {
  const s = setup();
  await s.create.execute({ title: "one" });
  expect(await s.list.execute({ status: "open", limit: 5 })).toEqual([
    expect.objectContaining({ title: "one", status: "open", createdAt: expect.any(String) }),
  ]);
  expect(s.remember).toHaveBeenCalledWith(TODO_LIST_CACHE_NAMESPACE, expect.any(Function), expect.any(Number), {
    queryKey: todoListQueryKey({ status: "open", limit: 5 }),
    lock: true,
    statsType: "todo-list",
  });
  const ttl = s.remember.mock.calls[0]![2]!;
  expect(ttl).toBeGreaterThanOrEqual(27);
  expect(ttl).toBeLessThanOrEqual(33);
});

test("list query keys are stable and distinguish every input", () => {
  expect(todoListQueryKey({ status: "open", limit: 5 })).toBe(todoListQueryKey({ limit: 5, status: "open" }));
  expect(todoListQueryKey({ limit: 5 })).toBe(todoListQueryKey({ status: undefined, limit: 5 }));
  const keys = new Set([
    todoListQueryKey({ limit: 5 }),
    todoListQueryKey({ status: "open", limit: 5 }),
    todoListQueryKey({ status: "open", limit: 6 }),
    todoListQueryKey({ status: "completed", limit: 5 }),
  ]);
  expect(keys.size).toBe(4);
});

test("the background notification write invalidates, and so does a redelivery (the first bump may have failed)", async () => {
  const s = setup();
  const event = { todoId: "todo_example", completedAt: new Date() };
  await s.notify.handle(event);
  await s.notify.handle(event);
  expect(s.invalidate).toHaveBeenCalledTimes(2);
  expect(s.invalidate).toHaveBeenNthCalledWith(2, TODO_LIST_CACHE_NAMESPACE);
});
