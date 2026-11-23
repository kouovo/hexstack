import { toPersistenceDate, type ITransactionManager, injectTransactionManager } from "@app/common/db";
import { inject, singleton } from "@app/common/di";

import { toTodoEntity, toTodoRecord } from "../app/todo.mapper";
import type { TodoSpecification } from "../domain/todo/specs/todo.specification";
import type { TodoId } from "../domain/todo/todo-id.value-object";
import type { TodoStatusValue } from "../domain/todo/todo-status.value-object";
import type { TodoEntity } from "../domain/todo/todo.entity";
import { TODO_TABLE, type TodoDatabase } from "./todo.database";
import { TodoQueryVisitor } from "./todo.query-visitor";

/** Stored shape of a todo. The Kysely row type must stay assignable to it (tsc checks it below). */
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

@singleton()
export class TodoRepository implements ITodoRepository {
  constructor(@injectTransactionManager() private readonly transactions: ITransactionManager) {}

  async findOne(spec: TodoSpecification): Promise<TodoEntity | undefined> {
    const row = await this.transactions
      .getExecutor<TodoDatabase>()
      .selectFrom(TODO_TABLE)
      .selectAll()
      .where((eb) => new TodoQueryVisitor(eb).$where(spec))
      .executeTakeFirst();
    return row ? toTodoEntity(row) : undefined;
  }

  async find(spec: TodoSpecification | undefined, { limit }: FindTodosOptions): Promise<TodoEntity[]> {
    const rows = await this.transactions
      .getExecutor<TodoDatabase>()
      .selectFrom(TODO_TABLE)
      .selectAll()
      .where((eb) => new TodoQueryVisitor(eb).$where(spec))
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(limit)
      .execute();
    return rows.map(toTodoEntity);
  }

  async insert(todo: TodoEntity): Promise<void> {
    await this.transactions.getExecutor<TodoDatabase>().insertInto(TODO_TABLE).values(toTodoRecord(todo)).execute();
  }

  async updateIfStatus(todo: TodoEntity, expected: TodoStatusValue): Promise<boolean> {
    const values = toTodoRecord(todo);
    const result = await this.transactions
      .getExecutor<TodoDatabase>()
      .updateTable(TODO_TABLE)
      .set({
        title: values.title,
        status: values.status,
        completed_at: values.completed_at,
        updated_at: values.updated_at,
      })
      .where("id", "=", todo.id.value)
      .where("status", "=", expected)
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async markCompletionNotified(id: TodoId, at: Date): Promise<boolean> {
    const result = await this.transactions
      .getExecutor<TodoDatabase>()
      .updateTable(TODO_TABLE)
      .set({ completion_notified_at: toPersistenceDate(at) })
      .where("id", "=", id.value)
      .where("status", "=", "completed")
      .where("completion_notified_at", "is", null)
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }
}
