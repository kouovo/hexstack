import { ValueObject } from "@app/core";
import { z } from "@app/zod";

import { UserEmailInvalidError } from "../errors/user.errors";

/** Trimmed and lower-cased so the unique index and look-ups agree. */
export const userEmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export class UserEmail extends ValueObject<string> {
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

  static create(value: string): UserEmail {
    const result = userEmailSchema.safeParse(value);
    if (!result.success) throw new UserEmailInvalidError();
    return new UserEmail(result.data);
  }

  static rehydrate(value: string): UserEmail {
    return new UserEmail(value);
  }
}
