import { QueryVisitor } from "@app/common/db";
import type { ExpressionBuilder } from "kysely";

import type { TodoIdSpecification } from "../domain/todo/specs/todo-id.specification";
import type { TodoStatusSpecification } from "../domain/todo/specs/todo-status.specification";
import type { TodoTitleSpecification } from "../domain/todo/specs/todo-title.specification";
import type { TodoEntity } from "../domain/todo/todo.entity";
import type { ITodoSpecVisitor } from "../domain/todo/todo.type";
import type { TODO_TABLE, TodoDatabase as Database } from "./todo.database";

type TodoTable = typeof TODO_TABLE;

export class TodoQueryVisitor extends QueryVisitor<TodoEntity, Database, TodoTable> implements ITodoSpecVisitor {
  constructor(protected override readonly eb: ExpressionBuilder<Database, TodoTable>) {
    super(eb);
  }

  override clone(): this {
    return new TodoQueryVisitor(this.eb) as this;
  }

  id(spec: TodoIdSpecification): void {
    this.addCond(this.eb("id", "=", spec.id.value));
  }

  title(spec: TodoTitleSpecification): void {
    this.addCond(this.eb("title", "=", spec.title.value));
  }

  status(spec: TodoStatusSpecification): void {
    this.addCond(this.eb("status", "=", spec.status.value));
  }
}
