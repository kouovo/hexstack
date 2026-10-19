import type { ITodoSpecVisitor, TodoEntity, TodoIdSpecification, TodoStatusSpecification } from "@app/domain";
import type { ExpressionBuilder } from "kysely";

import type { Database, TODO_TABLE } from "../db";
import { QueryVisitor } from "../query-visitor";

type TodoTable = typeof TODO_TABLE;

/** Translates todo specifications into a Kysely WHERE expression (and/or/not come from QueryVisitor). */
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

  status(spec: TodoStatusSpecification): void {
    this.addCond(this.eb("status", "=", spec.status.value));
  }
}
