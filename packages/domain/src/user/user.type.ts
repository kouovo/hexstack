import type { ISpecVisitor } from "@app/core";

import type { UserEmailSpecification } from "./specs/user-email.specification";
import type { UserIdSpecification } from "./specs/user-id.specification";
import type { UserPasswordHashSpecification } from "./specs/user-password-hash.specification";
import type { UserRoleSpecification } from "./specs/user-role.specification";

export interface IUserSpecVisitor extends ISpecVisitor {
  id(spec: UserIdSpecification): void;
  email(spec: UserEmailSpecification): void;
  passwordHash(spec: UserPasswordHashSpecification): void;
  role(spec: UserRoleSpecification): void;
}
