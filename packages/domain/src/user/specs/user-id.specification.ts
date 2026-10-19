import { NotImplementException } from "../../errors/common.errors";
import type { UserId } from "../user-id.value-object";
import type { UserEntity } from "../user.entity";
import type { IUserSpecVisitor } from "../user.type";
import { UserSpecification } from "./user.specification";

export class UserIdSpecification extends UserSpecification {
  constructor(public readonly id: UserId) {
    super();
  }

  isSatisfiedBy(user: UserEntity): boolean {
    return user.id.equals(this.id);
  }

  mutate(_user: UserEntity): UserEntity {
    throw new NotImplementException();
  }

  accept(visitor: IUserSpecVisitor): void {
    visitor.id(this);
  }
}
