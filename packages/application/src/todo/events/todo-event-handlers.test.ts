import { EventBus } from "@app/cqrs";
import { container } from "@app/di";
import { TodoArchivedEvent, TodoCompletedEvent, TodoCreatedEvent, type TodoEntity, type TodoSpecification } from "@app/domain";
import { describe, expect, test, vi } from "vitest";

import type { ApplicationTransactionPort } from "../../transaction";
import { ArchiveTodoCommand, ArchiveTodoCommandHandler } from "../commands/archive-todo.command";
import { CompleteTodoCommand, CompleteTodoCommandHandler } from "../commands/complete-todo.command";
import { CreateTodoCommand, CreateTodoCommandHandler } from "../commands/create-todo.command";
import type { ITodoRepository } from "../todo.repository.port";
import { TodoArchivedLogEventHandler } from "./todo-archived-log-event.handler";
import { TodoCompletedLogEventHandler } from "./todo-completed-log-event.handler";
import { TodoCreatedLogEventHandler } from "./todo-created-log-event.handler";

function setup() {
  const todos = new Map<string, TodoEntity>();
  const repo = {
    insert: async (todo: TodoEntity) => void todos.set(todo.id.value, todo),
    findOne: async (spec: TodoSpecification) => [...todos.values()].find((todo) => spec.isSatisfiedBy(todo)),
    updateIfStatus: async () => true,
  } as unknown as ITodoRepository;

  const order: string[] = [];
  const transaction: ApplicationTransactionPort = {
    run: async (work) => {
      const result = await work();
      order.push("commit");
      return result;
    },
  };
  const outbox = { append: vi.fn(async () => {}) };

  const eventBus = new EventBus();
  const created = container.resolve(TodoCreatedLogEventHandler);
  const completed = container.resolve(TodoCompletedLogEventHandler);
  const archived = container.resolve(TodoArchivedLogEventHandler);
  const spies = {
    created: vi.spyOn(created, "handle").mockImplementation(() => void order.push("TodoCreatedEvent")),
    completed: vi.spyOn(completed, "handle").mockImplementation(() => void order.push("TodoCompletedEvent")),
    archived: vi.spyOn(archived, "handle").mockImplementation(() => void order.push("TodoArchivedEvent")),
  };
  eventBus.register([TodoCreatedLogEventHandler, TodoCompletedLogEventHandler, TodoArchivedLogEventHandler]);

  return {
    order,
    spies,
    create: new CreateTodoCommandHandler(repo, transaction, outbox, eventBus),
    complete: new CompleteTodoCommandHandler(repo, transaction, outbox, eventBus),
    archive: new ArchiveTodoCommandHandler(repo, transaction, outbox, eventBus),
  };
}

describe("in-process todo event handlers", () => {
  test("each event reaches its @eventHandler, and only after the transaction commits", async () => {
    const s = setup();
    const todo = await s.create.execute(new CreateTodoCommand({ title: "events" }));
    await s.complete.execute(new CompleteTodoCommand({ todoId: todo.id }));
    await s.archive.execute(new ArchiveTodoCommand({ todoId: todo.id }));

    expect(s.order).toEqual(["commit", "TodoCreatedEvent", "commit", "TodoCompletedEvent", "commit", "TodoArchivedEvent"]);
    expect(s.spies.created).toHaveBeenCalledWith(expect.any(TodoCreatedEvent));
    expect(s.spies.completed).toHaveBeenCalledWith(expect.any(TodoCompletedEvent));
    expect(s.spies.archived).toHaveBeenCalledWith(expect.objectContaining({ previousStatus: "completed" }));
    expect(s.spies.archived.mock.calls[0]![0]).toBeInstanceOf(TodoArchivedEvent);
  });

  test("a failing in-process handler cannot fail the committed command", async () => {
    const s = setup();
    s.spies.created.mockImplementation(() => {
      throw new Error("handler exploded");
    });
    await expect(s.create.execute(new CreateTodoCommand({ title: "still created" }))).resolves.toMatchObject({ status: "open" });
  });

  test("archive goes through the status guard", async () => {
    const s = setup();
    const todo = await s.create.execute(new CreateTodoCommand({ title: "archive twice" }));
    await expect(s.archive.execute(new ArchiveTodoCommand({ todoId: todo.id }))).resolves.toMatchObject({ status: "archived" });
    await expect(s.archive.execute(new ArchiveTodoCommand({ todoId: todo.id }))).rejects.toMatchObject({
      _tag: "TodoTransitionNotAllowedError",
      from: "archived",
      to: "archived",
    });
  });
});
