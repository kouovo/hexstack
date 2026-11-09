import { container } from "@app/di";
import { TodoArchivedEvent, TodoCompletedEvent, TodoCreatedEvent, type TodoEntity, type TodoSpecification } from "@app/domain";
import { describe, expect, test, vi } from "vitest";

import { InProcessEventBus } from "../../events/in-process-event-bus";
import { IN_PROCESS_EVENT_SUBSCRIPTIONS } from "../../events/subscriptions";
import { DomainEventScope } from "../../shared/domain-event-scope";
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
  const outbox = { publishMany: vi.fn(async () => []) };

  const created = container.resolve(TodoCreatedLogEventHandler);
  const completed = container.resolve(TodoCompletedLogEventHandler);
  const archived = container.resolve(TodoArchivedLogEventHandler);
  const spies = {
    created: vi.spyOn(created, "handle").mockImplementation(() => void order.push(TodoCreatedEvent.name)),
    completed: vi.spyOn(completed, "handle").mockImplementation(() => void order.push(TodoCompletedEvent.name)),
    archived: vi.spyOn(archived, "handle").mockImplementation(() => void order.push(TodoArchivedEvent.name)),
  };
  // The real millstream in-process bus, with the app's logging subscriptions.
  const logging = IN_PROCESS_EVENT_SUBSCRIPTIONS.filter(({ name }) => name.endsWith(".log"));
  const bus = new InProcessEventBus(logging, (handler) => container.resolve(handler));
  const scope = new DomainEventScope(transaction, outbox, bus);

  return {
    order,
    spies,
    bus,
    create: new CreateTodoCommandHandler(repo, scope),
    complete: new CompleteTodoCommandHandler(repo, scope),
    archive: new ArchiveTodoCommandHandler(repo, scope),
  };
}

describe("in-process todo event handlers", () => {
  test("each event reaches its subscribed handler through millstream, and only after the transaction commits", async () => {
    const s = setup();
    const todo = await s.create.execute(new CreateTodoCommand({ title: "events" }));
    await s.complete.execute(new CompleteTodoCommand({ todoId: todo.id }));
    await s.archive.execute(new ArchiveTodoCommand({ todoId: todo.id }));

    expect(s.order).toEqual(["commit", "todo.created.v1", "commit", "todo.completed.v1", "commit", "todo.archived.v1"]);
    // Payloads went through JSON and the event schema: dates are real Dates again, and the meta carries the event id.
    expect(s.spies.created).toHaveBeenCalledWith({ todoId: todo.id, title: "events" }, expect.objectContaining({ id: expect.any(String) }));
    expect(s.spies.completed).toHaveBeenCalledWith({ todoId: todo.id, completedAt: expect.any(Date) }, expect.anything());
    expect(s.spies.archived).toHaveBeenCalledWith(
      { todoId: todo.id, previousStatus: "completed", archivedAt: expect.any(Date) },
      expect.anything(),
    );
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
