import { inject } from "@app/di";
import type { TodoEntity, TodoId, TodoSpecification, TodoStatusValue } from "@app/domain";

/** The SQL adapter's row type must stay assignable to this (tsc checks it in TodoRepository). */
export interface TodoRecord {
  id: string;
  title: string;
  status: string;
  completed_at: Date | null;
  completion_notified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type FindTodosOptions = {
  limit: number;
};

export interface ITodoRepository {
  findOne(spec: TodoSpecification): Promise<TodoEntity | undefined>;
  /** Newest first. */
  find(spec: TodoSpecification | undefined, options: FindTodosOptions): Promise<TodoEntity[]>;
  insert(todo: TodoEntity): Promise<void>;
  /** Optimistic concurrency: false when another writer changed the status first. */
  updateIfStatus(todo: TodoEntity, expected: TodoStatusValue): Promise<boolean>;
  /** False when already set, so redelivered jobs are no-ops. */
  markCompletionNotified(id: TodoId, at: Date): Promise<boolean>;
}

export const TODO_REPO = Symbol.for("TODO_REPO");
export const injectTodoRepo = () => inject(TODO_REPO);
