import type { IUserSpecVisitor, UserEmailSpecification, UserEntity, UserIdSpecification } from "@app/domain";
import type { ExpressionBuilder } from "kysely";

import type { Database, USER_TABLE } from "../db";
import { QueryVisitor } from "../query-visitor";

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
}
