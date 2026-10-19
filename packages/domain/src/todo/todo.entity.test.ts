import { describe, expect, test } from "vitest";

import { TodoTransitionNotAllowedError, TodoTitleInvalidError } from "../errors/todo.errors";
import { TodoArchivedEvent, TodoCompletedEvent, TodoCreatedEvent } from "./events";
import { TodoTitle } from "./todo-title.value-object";
import { TodoEntity } from "./todo.entity";

const newTodo = () => TodoEntity.create({ title: TodoTitle.create("Write the README") });

describe(TodoEntity.name, () => {
  test("create starts open and records TodoCreatedEvent", () => {
    const todo = newTodo();
    expect(todo.status.value).toBe("open");
    expect(todo.clearDomainEvents()).toEqual([expect.any(TodoCreatedEvent)]);
  });

  test("complete moves open -> completed and records TodoCompletedEvent", () => {
    const todo = newTodo();
    todo.clearDomainEvents();
    const at = new Date("2024-01-01T00:00:00Z");
    expect(todo.complete(at)).toBeUndefined();
    expect(todo.status.value).toBe("completed");
    expect(todo.completedAt).toEqual(at);
    const [event] = todo.clearDomainEvents();
    expect(event).toBeInstanceOf(TodoCompletedEvent);
    expect(event).toMatchObject({ aggregateId: todo.id.value, completedAt: at });
  });

  test("completing twice throws with context; the entity is unchanged and records no event", () => {
    const todo = newTodo();
    const completedAt = new Date("2024-01-01T00:00:00Z");
    todo.complete(completedAt);
    todo.clearDomainEvents();
    const updatedAt = todo.updatedAt;

    expect(() => todo.complete(new Date("2024-02-01T00:00:00Z"))).toThrow(TodoTransitionNotAllowedError);
    expect(() => todo.complete()).toThrow(
      expect.objectContaining({ _tag: "TodoTransitionNotAllowedError", todoId: todo.id.value, from: "completed", to: "completed" }),
    );
    expect(todo.status.value).toBe("completed");
    expect(todo.completedAt).toEqual(completedAt);
    expect(todo.updatedAt).toBe(updatedAt);
    expect(todo.clearDomainEvents()).toEqual([]);
  });

  test("archive records TodoArchivedEvent with the status it left; archiving again throws", () => {
    const todo = newTodo();
    todo.complete();
    todo.clearDomainEvents();
    expect(todo.archive()).toBeUndefined();
    expect(todo.status.value).toBe("archived");
    const [event] = todo.clearDomainEvents();
    expect(event).toBeInstanceOf(TodoArchivedEvent);
    expect(event).toMatchObject({ aggregateId: todo.id.value, previousStatus: "completed" });
    expect(() => todo.archive()).toThrow(expect.objectContaining({ from: "archived", to: "archived" }));
    expect(todo.clearDomainEvents()).toEqual([]);
  });

  test("completing an archived todo throws", () => {
    const todo = newTodo();
    todo.archive();
    expect(() => todo.complete()).toThrow(
      expect.objectContaining({ _tag: "TodoTransitionNotAllowedError", from: "archived", to: "completed" }),
    );
    expect(todo.status.value).toBe("archived");
  });

  test("title is validated", () => {
    expect(() => TodoTitle.create("   ")).toThrow(TodoTitleInvalidError);
  });
});
