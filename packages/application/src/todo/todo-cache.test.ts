import { EventBus } from "@app/cqrs";
import { container } from "@app/di";
import type { TodoEntity } from "@app/domain";
import { expect, test, vi } from "vitest";

import { uncached } from "../cache/cache.test-helper";
import type { ApplicationTransactionPort } from "../transaction";
import { ArchiveTodoCommand, ArchiveTodoCommandHandler } from "./commands/archive-todo.command";
import { CompleteTodoCommand, CompleteTodoCommandHandler } from "./commands/complete-todo.command";
import { CreateTodoCommand, CreateTodoCommandHandler } from "./commands/create-todo.command";
import { TodoArchivedCacheEventHandler, TodoCompletedCacheEventHandler, TodoCreatedCacheEventHandler } from "./events";
import { NotifyTodoCompletedJobHandler } from "./jobs/notify-todo-completed.job";
import { ListTodosQuery, ListTodosQueryHandler } from "./queries/list-todos.query";
import { TODO_CACHE_NAMESPACE } from "./todo-cache";
import type { ITodoRepository } from "./todo.repository.port";

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
  const outbox = { append: vi.fn(async () => {}) };
  const bus = new EventBus();
  const scope = container.createChildContainer();
  for (const Handler of [TodoCreatedCacheEventHandler, TodoCompletedCacheEventHandler, TodoArchivedCacheEventHandler]) {
    scope.register(Handler, { useValue: new Handler(cache) });
    bus.register([Handler], scope);
  }
  return {
    cache,
    invalidate,
    remember,
    order,
    outbox,
    create: new CreateTodoCommandHandler(repo, transaction, outbox, bus),
    complete: new CompleteTodoCommandHandler(repo, transaction, outbox, bus),
    archive: new ArchiveTodoCommandHandler(repo, transaction, outbox, bus),
    list: new ListTodosQueryHandler(repo, cache),
    job: new NotifyTodoCompletedJobHandler(repo, cache),
  };
}

test("all todo writes invalidate the shared list namespace, only after commit", async () => {
  const s = setup();
  const todo = await s.create.execute(new CreateTodoCommand({ title: "cached" }));
  await s.complete.execute(new CompleteTodoCommand({ todoId: todo.id }));
  await s.archive.execute(new ArchiveTodoCommand({ todoId: todo.id }));
  expect(s.order).toEqual(["commit", "invalidate", "commit", "invalidate", "commit", "invalidate"]);
  expect(s.invalidate.mock.calls).toEqual([[TODO_CACHE_NAMESPACE], [TODO_CACHE_NAMESPACE], [TODO_CACHE_NAMESPACE]]);
});

test("a failed transaction does not invalidate; a failing invalidation cannot fail a committed write", async () => {
  const s = setup();
  s.outbox.append.mockRejectedValueOnce(new Error("outbox failed"));
  await expect(s.create.execute(new CreateTodoCommand({ title: "rollback" }))).rejects.toThrow("outbox failed");
  expect(s.invalidate).not.toHaveBeenCalled();
  s.invalidate.mockRejectedValueOnce(new Error("cache failed"));
  await expect(s.create.execute(new CreateTodoCommand({ title: "committed" }))).resolves.toMatchObject({ title: "committed" });
});

test("a thrown domain error commits nothing, so it does not invalidate the cache", async () => {
  const s = setup();
  const todo = await s.create.execute(new CreateTodoCommand({ title: "archive twice" }));
  await s.archive.execute(new ArchiveTodoCommand({ todoId: todo.id }));
  s.invalidate.mockClear();
  await expect(s.archive.execute(new ArchiveTodoCommand({ todoId: todo.id }))).rejects.toMatchObject({
    _tag: "TodoTransitionNotAllowedError",
  });
  expect(s.invalidate).not.toHaveBeenCalled();
});

test("list cache keys include every filter/limit; cached values are DTOs", async () => {
  const s = setup();
  await s.create.execute(new CreateTodoCommand({ title: "one" }));
  expect(await s.list.execute(new ListTodosQuery({ status: "open", limit: 5 }))).toEqual([
    expect.objectContaining({ title: "one", status: "open", createdAt: expect.any(String) }),
  ]);
  expect(s.remember).toHaveBeenCalledWith(TODO_CACHE_NAMESPACE, expect.any(Function), 30, {
    queryKey: JSON.stringify({ status: "open", limit: 5 }),
  });
});

test("the background notification write invalidates; duplicate delivery does not", async () => {
  const s = setup();
  await s.job.process({ todoId: "todo_example" });
  await s.job.process({ todoId: "todo_example" });
  expect(s.invalidate).toHaveBeenCalledExactlyOnceWith(TODO_CACHE_NAMESPACE);
});
