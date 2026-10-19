import { NotImplementException } from "../../errors/common.errors";
import type { UserEmail } from "../user-email.value-object";
import type { UserEntity } from "../user.entity";
import type { IUserSpecVisitor } from "../user.type";
import { UserSpecification } from "./user.specification";

export class UserEmailSpecification extends UserSpecification {
  constructor(public readonly email: UserEmail) {
    super();
  }

  isSatisfiedBy(user: UserEntity): boolean {
    return user.email.equals(this.email);
  }

  mutate(_user: UserEntity): UserEntity {
    throw new NotImplementException();
  }

  accept(visitor: IUserSpecVisitor): void {
    visitor.email(this);
  }
}
