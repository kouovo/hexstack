import type { PasswordHash } from "../password-hash.value-object";
import type { IUserState, UserEntity } from "../user.entity";
import type { IUserSpecVisitor } from "../user.type";
import { UserSpecification } from "./user.specification";

export class UserPasswordHashSpecification extends UserSpecification {
  constructor(public readonly passwordHash: PasswordHash) {
    super();
  }

  isSatisfiedBy(user: UserEntity): boolean {
    return user.passwordHash.equals(this.passwordHash);
  }

  override create(state: IUserState): IUserState {
    return { ...state, passwordHash: this.passwordHash };
  }

  accept(visitor: IUserSpecVisitor): void {
    visitor.passwordHash(this);
  }
}
