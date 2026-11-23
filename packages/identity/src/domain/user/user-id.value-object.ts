import { generateId, IdentifierValue } from "@app/common/ddd";
import { z } from "@app/common/zod";

import { UserIdRequiredError } from "./user.errors";

export const userIdSchema = z.string().trim().min(1);

declare const userIdBrand: unique symbol;
export class UserId extends IdentifierValue {
  declare protected readonly [userIdBrand]: typeof userIdBrand;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): UserId {
    const result = userIdSchema.safeParse(value);
    if (!result.success) throw new UserIdRequiredError();
    return new UserId(result.data);
  }

  static generate(): UserId {
    return new UserId(generateId("usr"));
  }

  static rehydrate(value: string): UserId {
    return new UserId(value);
  }
}
