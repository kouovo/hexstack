import { ValueObject } from "@app/core";
import { z } from "@app/zod";

import { PasswordPolicyViolationError } from "../errors/user.errors";

/**
 * Password policy (domain invariant for every NEW password):
 * 8-100 printable ASCII characters, no leading/trailing space, no composition rules.
 * Invalid input is rejected with a reason, never silently trimmed or modified.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 100;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .regex(/^[\x20-\x7E]*$/, "Password may only contain printable ASCII characters")
  .refine((value) => value.trim() === value, "Password must not start or end with a space");

/**
 * A plaintext password that satisfies the policy. Short-lived: exists only between the request and hashing.
 * It never serialises its secret: toJSON/toString are explicitly redacted.
 */
export class Password extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  /** @throws {PasswordPolicyViolationError} with the first policy violation. */
  static parse(value: string): Password {
    const result = passwordSchema.safeParse(value);
    if (!result.success) throw new PasswordPolicyViolationError({ rule: result.error.issues[0]?.message ?? "Password is invalid" });
    return new Password(result.data);
  }

  static create(value: string): Password {
    return Password.parse(value);
  }

  /** The secret itself; only the PasswordHasher should read this. */
  reveal(): string {
    return this.state;
  }

  override toString(): string {
    return "[redacted password]";
  }

  toJSON(): string {
    return "[redacted password]";
  }
}
