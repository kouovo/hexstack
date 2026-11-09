import { AggregateRoot, type IEntityState } from "@app/core";

import { UserRoleChangedEvent, UserSignedUpEvent } from "./events";
import type { PasswordHash } from "./password-hash.value-object";
import type { UserSpecification } from "./specs/user.specification";
import type { UserEmail } from "./user-email.value-object";
import { UserId } from "./user-id.value-object";
import { UserRole } from "./user-role.value-object";

export interface IUserState extends IEntityState<UserId> {
  email: UserEmail;
  /** Produced by the PasswordHasher port from a policy-checked Password. Never leaves the server. */
  passwordHash: PasswordHash;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export class UserEntity extends AggregateRoot<IUserState> {
  get email(): UserEmail {
    return this.state.email;
  }

  get passwordHash(): PasswordHash {
    return this.state.passwordHash;
  }

  get role(): UserRole {
    return this.state.role;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }

  get updatedAt(): Date {
    return this.state.updatedAt;
  }

  /**
   * Builds a new user from specifications: the defaults below, then each spec writes its own value.
   * Email and password hash have no default; callers pass UserEmailSpecification and
   * UserPasswordHashSpecification (the sign-up handler always does).
   */
  static signUp(spec: UserSpecification, at = new Date()): UserEntity {
    const state = spec.create({
      id: UserId.generate(),
      role: UserRole.default(),
      createdAt: at,
      updatedAt: at,
    } as IUserState);
    const user = new UserEntity(state);
    user.addDomainEvent(UserSignedUpEvent, { userId: user.id.value, email: user.email.value });
    return user;
  }

  static rehydrate(state: IUserState): UserEntity {
    return new UserEntity({ ...state });
  }

  /** Replaces the stored hash (e.g. after a password change or a hash-parameter upgrade). */
  changePasswordHash(passwordHash: PasswordHash, at = new Date()): void {
    this.state.passwordHash = passwordHash;
    this.state.updatedAt = at;
  }

  /** Returns false (and records nothing) when the role is unchanged. */
  changeRole(role: UserRole, at = new Date()): boolean {
    if (role.equals(this.state.role)) return false;
    const previousRole = this.state.role.value;
    this.state.role = role;
    this.state.updatedAt = at;
    this.addDomainEvent(UserRoleChangedEvent, { userId: this.id.value, previousRole, role: role.value });
    return true;
  }
}
