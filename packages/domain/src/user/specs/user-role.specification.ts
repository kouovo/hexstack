import type { UserRole } from "../user-role.value-object";
import type { IUserState, UserEntity } from "../user.entity";
import type { IUserSpecVisitor } from "../user.type";
import { UserSpecification } from "./user.specification";

export class UserRoleSpecification extends UserSpecification {
  constructor(public readonly role: UserRole) {
    super();
  }

  isSatisfiedBy(user: UserEntity): boolean {
    return user.role.equals(this.role);
  }

  override create(state: IUserState): IUserState {
    return { ...state, role: this.role };
  }

  accept(visitor: IUserSpecVisitor): void {
    visitor.role(this);
  }
}
