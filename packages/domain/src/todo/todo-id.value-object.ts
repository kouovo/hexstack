import { generateId, IdentifierValue } from "@app/core";
import { z } from "@app/zod";

import { TodoIdRequiredError } from "../errors/todo.errors";

export const todoIdSchema = z.string().trim().min(1);

declare const todoIdBrand: unique symbol;
export class TodoId extends IdentifierValue {
  declare protected readonly [todoIdBrand]: typeof todoIdBrand;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): TodoId {
    const result = todoIdSchema.safeParse(value);
    if (!result.success) throw new TodoIdRequiredError();
    return new TodoId(result.data);
  }

  static generate(): TodoId {
    return new TodoId(generateId("todo"));
  }

  static rehydrate(value: string): TodoId {
    return new TodoId(value.trim());
  }
}
