import type { TodoId } from "../todo-id.value-object";
import type { ITodoState, TodoEntity } from "../todo.entity";
import type { ITodoSpecVisitor } from "../todo.type";
import { TodoSpecification } from "./todo.specification";

export class TodoIdSpecification extends TodoSpecification {
  constructor(public readonly id: TodoId) {
    super();
  }

  isSatisfiedBy(todo: TodoEntity): boolean {
    return todo.id.equals(this.id);
  }

  override create(state: ITodoState): ITodoState {
    return { ...state, id: this.id };
  }

  accept(visitor: ITodoSpecVisitor): void {
    visitor.id(this);
  }
}
