import { defineStateMachine, ValueObject } from "@app/core";
import { z } from "@app/zod";

import { TodoStatusInvalidError } from "../errors/todo.errors";

export const todoStatusSchema = z.enum(["open", "completed", "archived"]);
export type TodoStatusValue = z.infer<typeof todoStatusSchema>;

/** Every allowed status change lives here; the entity and the conditional UPDATE both rely on it. */
export const todoStatusMachine = defineStateMachine<TodoStatusValue>("todo", {
  open: ["completed", "archived"],
  completed: ["archived"],
  archived: [],
});

export class TodoStatus extends ValueObject<TodoStatusValue> {
  private constructor(value: TodoStatusValue) {
    super(value);
  }

  get value(): TodoStatusValue {
    return this.state;
  }
  override toString(): string {
    return this.state;
  }
  toJSON(): TodoStatusValue {
    return this.state;
  }

  static create(value: string): TodoStatus {
    const parsed = todoStatusSchema.safeParse(value);
    if (!parsed.success) throw new TodoStatusInvalidError(value);
    return new TodoStatus(parsed.data);
  }

  static open(): TodoStatus {
    return new TodoStatus("open");
  }

  static rehydrate(value: string): TodoStatus {
    return new TodoStatus(todoStatusSchema.parse(value));
  }

  canTransitionTo(next: TodoStatusValue): boolean {
    return todoStatusMachine.can(this.value, next);
  }
}
