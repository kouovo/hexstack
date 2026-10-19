import { TodoEntity, TodoTitle } from "@app/domain";
import { expect, test } from "vitest";

import { TodoMapper } from "./todo.mapper";

const at = new Date("2024-01-01T00:00:00.000Z");
function completedTodo() {
  const todo = TodoEntity.create({ title: TodoTitle.create("map me"), createdAt: at });
  todo.complete(at);
  return todo;
}

test("toPersistence -> toEntity round-trips every field", () => {
  const todo = completedTodo();
  const record = TodoMapper.toPersistence(todo);
  expect(record).toEqual({
    id: todo.id.value,
    title: "map me",
    status: "completed",
    completed_at: at,
    completion_notified_at: null,
    created_at: at,
    updated_at: at,
  });
  expect(TodoMapper.toPersistence(TodoMapper.toEntity(record))).toEqual(record);
});

test("toEntity accepts string timestamps from the driver", () => {
  const record = TodoMapper.toPersistence(completedTodo());
  const entity = TodoMapper.toEntity({ ...record, created_at: at.toISOString() as unknown as Date });
  expect(entity.createdAt).toEqual(at);
});

test("toResponse produces a serialisable DTO", () => {
  const todo = completedTodo();
  expect(TodoMapper.toResponse(todo)).toEqual({
    id: todo.id.value,
    title: "map me",
    status: "completed",
    completedAt: "2024-01-01T00:00:00.000Z",
    completionNotifiedAt: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  });
});
