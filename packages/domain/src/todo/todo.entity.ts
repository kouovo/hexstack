import { AggregateRoot, type IEntityState } from "@app/core";

import { TodoTransitionNotAllowedError } from "../errors/todo.errors";
import { TodoArchivedEvent, TodoCompletedEvent, TodoCreatedEvent } from "./events";
import type { TodoSpecification } from "./specs/todo.specification";
import { TodoId } from "./todo-id.value-object";
import { TodoStatus, type TodoStatusValue } from "./todo-status.value-object";
import type { TodoTitle } from "./todo-title.value-object";

export interface ITodoState extends IEntityState<TodoId> {
  title: TodoTitle;
  status: TodoStatus;
  completedAt: Date | null;
  /** Set once by the completion job (ITodoRepository.markCompletionNotified). */
  completionNotifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class TodoEntity extends AggregateRoot<ITodoState> {
  get title(): TodoTitle {
    return this.state.title;
  }

  get status(): TodoStatus {
    return this.state.status;
  }

  get completedAt(): Date | null {
    return this.state.completedAt;
  }

  get completionNotifiedAt(): Date | null {
    return this.state.completionNotifiedAt;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }

  get updatedAt(): Date {
    return this.state.updatedAt;
  }

  /** The title has no default: pass a TodoTitleSpecification. */
  static create(spec: TodoSpecification, at = new Date()): TodoEntity {
    const state = spec.create({
      id: TodoId.generate(),
      status: TodoStatus.open(),
      completedAt: null,
      completionNotifiedAt: null,
      createdAt: at,
      updatedAt: at,
    } as ITodoState);
    const todo = new TodoEntity(state);
    todo.addDomainEvent(TodoCreatedEvent, { todoId: todo.id.value, title: todo.title.value });
    return todo;
  }

  static rehydrate(state: ITodoState): TodoEntity {
    return new TodoEntity({ ...state });
  }

  complete(at = new Date()): void {
    this.transitionTo("completed", at);
    this.state.completedAt = at;
    this.addDomainEvent(TodoCompletedEvent, { todoId: this.id.value, completedAt: at });
  }

  archive(at = new Date()): void {
    const previousStatus = this.state.status.value;
    this.transitionTo("archived", at);
    this.addDomainEvent(TodoArchivedEvent, { todoId: this.id.value, previousStatus, archivedAt: at });
  }

  private transitionTo(next: TodoStatusValue, at: Date): void {
    const from = this.state.status.value;
    if (!this.state.status.canTransitionTo(next)) {
      throw new TodoTransitionNotAllowedError({ todoId: this.id.value, from, to: next });
    }
    this.state.status = TodoStatus.create(next);
    this.state.updatedAt = at;
  }
}
