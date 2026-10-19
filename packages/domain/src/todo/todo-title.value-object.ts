import { ValueObject } from "@app/core";
import { z } from "@app/zod";

import { TodoTitleInvalidError } from "../errors/todo.errors";

export const todoTitleSchema = z.string().trim().min(1).max(200);

export class TodoTitle extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  get value(): string {
    return this.state;
  }
  override toString(): string {
    return this.state;
  }
  toJSON(): string {
    return this.state;
  }

  static create(value: string): TodoTitle {
    const result = todoTitleSchema.safeParse(value);
    if (!result.success) throw new TodoTitleInvalidError(value.trim().length);
    return new TodoTitle(result.data);
  }

  static rehydrate(value: string): TodoTitle {
    return new TodoTitle(value);
  }
}
