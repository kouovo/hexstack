import { NotImplementException } from "../../errors/common.errors";
import type { TodoStatus } from "../todo-status.value-object";
import type { TodoEntity } from "../todo.entity";
import type { ITodoSpecVisitor } from "../todo.type";
import { TodoSpecification } from "./todo.specification";

export class TodoStatusSpecification extends TodoSpecification {
  constructor(public readonly status: TodoStatus) {
    super();
  }

  isSatisfiedBy(todo: TodoEntity): boolean {
    return todo.status.equals(this.status);
  }

  mutate(_todo: TodoEntity): TodoEntity {
    throw new NotImplementException();
  }

  accept(visitor: ITodoSpecVisitor): void {
    visitor.status(this);
  }
}
