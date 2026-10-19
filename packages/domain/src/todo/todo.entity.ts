import { AggregateRoot, type IEntityState } from "@app/core";

import { TodoTransitionNotAllowedError } from "../errors/todo.errors";
import { TodoArchivedEvent, TodoCompletedEvent, TodoCreatedEvent } from "./events";
import { TodoId } from "./todo-id.value-object";
import { TodoStatus, type TodoStatusValue } from "./todo-status.value-object";
import { TodoTitle } from "./todo-title.value-object";

export interface ITodoState extends IEntityState<TodoId> {
  title: TodoTitle;
  status: TodoStatus;
  completedAt: Date | null;
  /** Set once by the async completion job; see ITodoRepository.markCompletionNotified. */
  completionNotifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateTodoProps = {
  title: TodoTitle;
  id?: TodoId;
  createdAt?: Date;
};

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

  static create(props: CreateTodoProps): TodoEntity {
    const now = props.createdAt ?? new Date();
    const todo = new TodoEntity({
      id: props.id ?? TodoId.generate(),
      title: props.title,
      status: TodoStatus.open(),
      completedAt: null,
      completionNotifiedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    todo.addDomainEvent(new TodoCreatedEvent({ aggregateId: todo.id.value, title: todo.title.value }));
    return todo;
  }

  static rehydrate(state: ITodoState): TodoEntity {
    return new TodoEntity({ ...state });
  }

  /** open -> completed. A rejected transition leaves state and events unchanged. */
  complete(at = new Date()): void {
    this.transitionTo("completed", at);
    this.state.completedAt = at;
    this.addDomainEvent(new TodoCompletedEvent({ aggregateId: this.id.value, completedAt: at }));
  }

  /** open|completed -> archived. A rejected transition leaves state and events unchanged. */
  archive(at = new Date()): void {
    const previousStatus = this.state.status.value;
    this.transitionTo("archived", at);
    this.addDomainEvent(new TodoArchivedEvent({ aggregateId: this.id.value, previousStatus, archivedAt: at }));
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
