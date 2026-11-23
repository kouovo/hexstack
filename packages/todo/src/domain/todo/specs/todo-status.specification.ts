import type { TodoStatus } from "../todo-status.value-object";
import type { TodoEntity } from "../todo.entity";
import type { ITodoSpecVisitor } from "../todo.type";
import { TodoSpecification } from "./todo.specification";

/** Query-only: a todo always starts open, so this spec does not take part in creation. */
export class TodoStatusSpecification extends TodoSpecification {
  constructor(public readonly status: TodoStatus) {
    super();
  }

  isSatisfiedBy(todo: TodoEntity): boolean {
    return todo.status.equals(this.status);
  }

  accept(visitor: ITodoSpecVisitor): void {
    visitor.status(this);
  }
}
