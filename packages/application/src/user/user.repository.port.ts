import { inject } from "@app/di";
import type { UserEntity, UserSpecification } from "@app/domain";

/** Stored shape of a user (see TodoRecord for why it lives next to the port). */
export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}

export interface IUserRepository {
  findOne(spec: UserSpecification): Promise<UserEntity | undefined>;
  find(spec: UserSpecification | undefined, options: { limit: number }): Promise<UserEntity[]>;
  /** @throws {EmailAlreadyRegisteredError} when a racing sign-up hits the unique email index. */
  insert(user: UserEntity): Promise<void>;
  update(user: UserEntity): Promise<void>;
}

export const USER_REPO = Symbol.for("USER_REPO");
export const injectUserRepo = () => inject(USER_REPO);
