import type { IMapper } from "@app/core";
import { TodoEntity, TodoId, TodoStatus, TodoTitle } from "@app/domain";

import type { ITodoDTO } from "./todo.dto";
import type { TodoRecord } from "./todo.repository.port";

// Drivers may hand back timestamps as strings; normalise on the way in.
const toDate = (value: Date | string): Date => new Date(value);
const toNullableDate = (value: Date | string | null): Date | null => (value === null ? null : new Date(value));

/** The only place that converts a todo between record, entity and DTO. */
export const TodoMapper: IMapper<TodoEntity, TodoRecord, ITodoDTO> = {
  toEntity(record) {
    return TodoEntity.rehydrate({
      id: TodoId.rehydrate(record.id),
      title: TodoTitle.rehydrate(record.title),
      status: TodoStatus.rehydrate(record.status),
      completedAt: toNullableDate(record.completed_at),
      completionNotifiedAt: toNullableDate(record.completion_notified_at),
      createdAt: toDate(record.created_at),
      updatedAt: toDate(record.updated_at),
    });
  },

  toPersistence(todo) {
    return {
      id: todo.id.value,
      title: todo.title.value,
      status: todo.status.value,
      completed_at: todo.completedAt,
      completion_notified_at: todo.completionNotifiedAt,
      created_at: todo.createdAt,
      updated_at: todo.updatedAt,
    };
  },

  toResponse(todo) {
    return {
      id: todo.id.value,
      title: todo.title.value,
      status: todo.status.value,
      completedAt: todo.completedAt?.toISOString() ?? null,
      completionNotifiedAt: todo.completionNotifiedAt?.toISOString() ?? null,
      createdAt: todo.createdAt.toISOString(),
      updatedAt: todo.updatedAt.toISOString(),
    };
  },
};
