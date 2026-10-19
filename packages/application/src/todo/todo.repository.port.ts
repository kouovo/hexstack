import { inject } from "@app/di";
import type { TodoEntity, TodoId, TodoSpecification, TodoStatusValue } from "@app/domain";

/**
 * Stored shape of a todo, as the repository reads and writes it.
 * Declared next to the port so the mapper can live here without depending on persistence;
 * the SQL adapter's row type must stay assignable to it (tsc checks this in TodoRepository).
 */
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
  /** `spec` undefined = no filter. Newest first. */
  find(spec: TodoSpecification | undefined, options: FindTodosOptions): Promise<TodoEntity[]>;
  insert(todo: TodoEntity): Promise<void>;
  /**
   * Conditional UPDATE: persists `todo` only while the stored status still equals `expected`.
   * Returns false when another writer changed the row first (optimistic concurrency).
   */
  updateIfStatus(todo: TodoEntity, expected: TodoStatusValue): Promise<boolean>;
  /**
   * Conditional UPDATE: sets completion_notified_at once for a completed todo.
   * Returns false when it was already set, so redelivered jobs become no-ops.
   */
  markCompletionNotified(id: TodoId, at: Date): Promise<boolean>;
}

export const TODO_REPO = Symbol.for("TODO_REPO");
export const injectTodoRepo = () => inject(TODO_REPO);
