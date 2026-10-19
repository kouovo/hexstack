import { ValueObject } from "@app/core";

import { UserRoleInvalidError } from "../errors/user.errors";
import { type Permissions, roleHasPermissions, roleSchema, type RoleValue } from "../rbac";

export class UserRole extends ValueObject<RoleValue> {
  private constructor(value: RoleValue) {
    super(value);
  }

  get value(): RoleValue {
    return this.state;
  }
  override toString(): string {
    return this.state;
  }
  toJSON(): RoleValue {
    return this.state;
  }

  static create(value: string): UserRole {
    const parsed = roleSchema.safeParse(value);
    if (!parsed.success) throw new UserRoleInvalidError(value);
    return new UserRole(parsed.data);
  }

  /** Role given to every new sign-up. Promote with the CLI (`user role`) or `user.assignRole`. */
  static default(): UserRole {
    return new UserRole("member");
  }

  static rehydrate(value: string): UserRole {
    return new UserRole(roleSchema.parse(value));
  }

  can(required: Permissions): boolean {
    return roleHasPermissions(this.value, required);
  }
}
