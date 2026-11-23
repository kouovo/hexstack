import type { TodoTitle } from "../todo-title.value-object";
import type { ITodoState, TodoEntity } from "../todo.entity";
import type { ITodoSpecVisitor } from "../todo.type";
import { TodoSpecification } from "./todo.specification";

export class TodoTitleSpecification extends TodoSpecification {
  constructor(public readonly title: TodoTitle) {
    super();
  }

  isSatisfiedBy(todo: TodoEntity): boolean {
    return todo.title.equals(this.title);
  }

  override create(state: ITodoState): ITodoState {
    return { ...state, title: this.title };
  }

  accept(visitor: ITodoSpecVisitor): void {
    visitor.title(this);
  }
}
