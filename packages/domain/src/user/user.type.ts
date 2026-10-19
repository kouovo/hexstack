import type { ISpecVisitor } from "@app/core";

import type { UserEmailSpecification } from "./specs/user-email.specification";
import type { UserIdSpecification } from "./specs/user-id.specification";

export interface IUserSpecVisitor extends ISpecVisitor {
  id(spec: UserIdSpecification): void;
  email(spec: UserEmailSpecification): void;
}
