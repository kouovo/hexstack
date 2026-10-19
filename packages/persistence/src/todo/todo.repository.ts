import { type FindTodosOptions, type ITodoRepository, TodoMapper } from "@app/application";
import { singleton } from "@app/di";
import type { TodoEntity, TodoId, TodoSpecification, TodoStatusValue } from "@app/domain";

import { TODO_TABLE } from "../db";
import { toPersistenceDate } from "../persistence-date";
import { type ITransactionManager, injectTransactionManager } from "../transaction";
import { TodoQueryVisitor } from "./todo.query-visitor";

@singleton()
export class TodoRepository implements ITodoRepository {
  constructor(@injectTransactionManager() private readonly transactions: ITransactionManager) {}

  async findOne(spec: TodoSpecification): Promise<TodoEntity | undefined> {
    const row = await this.transactions
      .getExecutor()
      .selectFrom(TODO_TABLE)
      .selectAll()
      .where((eb) => new TodoQueryVisitor(eb).$where(spec))
      .executeTakeFirst();
    return row ? TodoMapper.toEntity(row) : undefined;
  }

  async find(spec: TodoSpecification | undefined, { limit }: FindTodosOptions): Promise<TodoEntity[]> {
    const rows = await this.transactions
      .getExecutor()
      .selectFrom(TODO_TABLE)
      .selectAll()
      .where((eb) => new TodoQueryVisitor(eb).$where(spec))
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(limit)
      .execute();
    return rows.map((row) => TodoMapper.toEntity(row));
  }

  async insert(todo: TodoEntity): Promise<void> {
    await this.transactions.getExecutor().insertInto(TODO_TABLE).values(TodoMapper.toPersistence(todo)).execute();
  }

  async updateIfStatus(todo: TodoEntity, expected: TodoStatusValue): Promise<boolean> {
    const values = TodoMapper.toPersistence(todo);
    const result = await this.transactions
      .getExecutor()
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
      .getExecutor()
      .updateTable(TODO_TABLE)
      .set({ completion_notified_at: toPersistenceDate(at) })
      .where("id", "=", id.value)
      .where("status", "=", "completed")
      .where("completion_notified_at", "is", null)
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }
}
