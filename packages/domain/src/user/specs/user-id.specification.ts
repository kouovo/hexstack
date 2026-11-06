import type { UserId } from "../user-id.value-object";
import type { IUserState, UserEntity } from "../user.entity";
import type { IUserSpecVisitor } from "../user.type";
import { UserSpecification } from "./user.specification";

export class UserIdSpecification extends UserSpecification {
  constructor(public readonly id: UserId) {
    super();
  }

  isSatisfiedBy(user: UserEntity): boolean {
    return user.id.equals(this.id);
  }

  override create(state: IUserState): IUserState {
    return { ...state, id: this.id };
  }

  accept(visitor: IUserSpecVisitor): void {
    visitor.id(this);
  }
}
