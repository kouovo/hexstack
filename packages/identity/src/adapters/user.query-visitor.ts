import { QueryVisitor } from "@app/common/db";
import type { ExpressionBuilder } from "kysely";

import type { UserEmailSpecification } from "../domain/user/specs/user-email.specification";
import type { UserIdSpecification } from "../domain/user/specs/user-id.specification";
import type { UserPasswordHashSpecification } from "../domain/user/specs/user-password-hash.specification";
import type { UserRoleSpecification } from "../domain/user/specs/user-role.specification";
import type { UserEntity } from "../domain/user/user.entity";
import type { IUserSpecVisitor } from "../domain/user/user.type";
import type { IdentityDatabase as Database, USER_TABLE } from "./identity.database";

type UserTable = typeof USER_TABLE;

export class UserQueryVisitor extends QueryVisitor<UserEntity, Database, UserTable> implements IUserSpecVisitor {
  constructor(protected override readonly eb: ExpressionBuilder<Database, UserTable>) {
    super(eb);
  }

  override clone(): this {
    return new UserQueryVisitor(this.eb) as this;
  }

  id(spec: UserIdSpecification): void {
    this.addCond(this.eb("id", "=", spec.id.value));
  }

  email(spec: UserEmailSpecification): void {
    this.addCond(this.eb("email", "=", spec.email.value));
  }

  passwordHash(spec: UserPasswordHashSpecification): void {
    this.addCond(this.eb("password_hash", "=", spec.passwordHash.value));
  }

  role(spec: UserRoleSpecification): void {
    this.addCond(this.eb("role", "=", spec.role.value));
  }
}
