import type { ISpecVisitor } from "@app/core";

import type { TodoIdSpecification } from "./specs/todo-id.specification";
import type { TodoStatusSpecification } from "./specs/todo-status.specification";

/** One method per concrete spec. Persistence implements it as a SQL query visitor. */
export interface ITodoSpecVisitor extends ISpecVisitor {
  id(spec: TodoIdSpecification): void;
  status(spec: TodoStatusSpecification): void;
}
