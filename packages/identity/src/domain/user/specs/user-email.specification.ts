import type { UserEmail } from "../user-email.value-object";
import type { IUserState, UserEntity } from "../user.entity";
import type { IUserSpecVisitor } from "../user.type";
import { UserSpecification } from "./user.specification";

export class UserEmailSpecification extends UserSpecification {
  constructor(public readonly email: UserEmail) {
    super();
  }

  isSatisfiedBy(user: UserEntity): boolean {
    return user.email.equals(this.email);
  }

  override create(state: IUserState): IUserState {
    return { ...state, email: this.email };
  }

  accept(visitor: IUserSpecVisitor): void {
    visitor.email(this);
  }
}
