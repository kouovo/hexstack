import { ValueObject } from "@app/core";

import { PasswordHashInvalidError } from "../errors/user.errors";

/** Opaque PHC string: the domain never inspects it. */
export class PasswordHash extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): PasswordHash {
    if (!value.startsWith("$")) throw new PasswordHashInvalidError();
    return new PasswordHash(value);
  }

  static rehydrate(value: string): PasswordHash {
    return new PasswordHash(value);
  }

  get value(): string {
    return this.state;
  }

  override toString(): string {
    return "[redacted password hash]";
  }

  toJSON(): string {
    return "[redacted password hash]";
  }
}
