import { TodoEntity, TodoTitle, TodoTitleSpecification } from "@app/domain";
import { expect, test } from "vitest";

import { toTodoDTO, toTodoEntity, toTodoRecord } from "./todo.mapper";

const at = new Date("2024-01-01T00:00:00.000Z");
function completedTodo() {
  const todo = TodoEntity.create(new TodoTitleSpecification(TodoTitle.create("map me")), at);
  todo.complete(at);
  return todo;
}

test("toTodoRecord -> toTodoEntity round-trips every field", () => {
  const todo = completedTodo();
  const record = toTodoRecord(todo);
  expect(record).toEqual({
    id: todo.id.value,
    title: "map me",
    status: "completed",
    completed_at: at,
    completion_notified_at: null,
    created_at: at,
    updated_at: at,
  });
  expect(toTodoRecord(toTodoEntity(record))).toEqual(record);
});

test("toTodoEntity accepts string timestamps from the driver", () => {
  const record = toTodoRecord(completedTodo());
  const entity = toTodoEntity({ ...record, created_at: at.toISOString() as unknown as Date });
  expect(entity.createdAt).toEqual(at);
});

test("toTodoDTO produces a serialisable DTO", () => {
  const todo = completedTodo();
  expect(toTodoDTO(todo)).toEqual({
    id: todo.id.value,
    title: "map me",
    status: "completed",
    completedAt: "2024-01-01T00:00:00.000Z",
    completionNotifiedAt: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  });
});
