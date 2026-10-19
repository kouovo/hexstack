import { NotImplementException } from "../../errors/common.errors";
import type { TodoId } from "../todo-id.value-object";
import type { TodoEntity } from "../todo.entity";
import type { ITodoSpecVisitor } from "../todo.type";
import { TodoSpecification } from "./todo.specification";

export class TodoIdSpecification extends TodoSpecification {
  constructor(public readonly id: TodoId) {
    super();
  }

  isSatisfiedBy(todo: TodoEntity): boolean {
    return todo.id.equals(this.id);
  }

  mutate(_todo: TodoEntity): TodoEntity {
    throw new NotImplementException();
  }

  accept(visitor: ITodoSpecVisitor): void {
    visitor.id(this);
  }
}
