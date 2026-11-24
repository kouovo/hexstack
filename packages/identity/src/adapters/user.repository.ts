import { type DomainEventTracker, injectDomainEventTracker } from "@app/common/cqrs";
import { type ITransactionManager, injectTransactionManager } from "@app/common/db";
import { inject, singleton } from "@app/common/di";

import { toUserEntity, toUserRecord } from "../app/user.mapper";
import type { UserSpecification } from "../domain/user/specs/user.specification";
import type { UserEntity } from "../domain/user/user.entity";
import { EmailAlreadyRegisteredError } from "../domain/user/user.errors";
import { type IdentityDatabase, USER_TABLE } from "./identity.database";
import { UserQueryVisitor } from "./user.query-visitor";

/** Stored shape of a user. */
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

const UNIQUE_VIOLATION = "23505";

@singleton()
export class UserRepository implements IUserRepository {
  constructor(
    @injectTransactionManager() private readonly transactions: ITransactionManager,
    @injectDomainEventTracker() private readonly events: DomainEventTracker,
  ) {}

  async findOne(spec: UserSpecification): Promise<UserEntity | undefined> {
    const row = await this.transactions
      .getExecutor<IdentityDatabase>()
      .selectFrom(USER_TABLE)
      .selectAll()
      .where((eb) => new UserQueryVisitor(eb).$where(spec))
      .executeTakeFirst();
    return row ? toUserEntity(row) : undefined;
  }

  async find(spec: UserSpecification | undefined, { limit }: { limit: number }): Promise<UserEntity[]> {
    const rows = await this.transactions
      .getExecutor<IdentityDatabase>()
      .selectFrom(USER_TABLE)
      .selectAll()
      .where((eb) => new UserQueryVisitor(eb).$where(spec))
      .orderBy("created_at", "asc")
      .orderBy("id", "asc")
      .limit(limit)
      .execute();
    return rows.map(toUserEntity);
  }

  async insert(user: UserEntity): Promise<void> {
    this.events.track(user); // first: outside a transaction it throws before writing
    try {
      await this.transactions.getExecutor<IdentityDatabase>().insertInto(USER_TABLE).values(toUserRecord(user)).execute();
    } catch (cause) {
      // Only translate the expected unique violation; preserve unexpected errors unchanged.
      if ((cause as { code?: string } | null)?.code === UNIQUE_VIOLATION) {
        throw new EmailAlreadyRegisteredError({ detectedBy: "unique-constraint", cause });
      }
      throw cause;
    }
  }

  async update(user: UserEntity): Promise<void> {
    this.events.track(user);
    const values = toUserRecord(user);
    await this.transactions
      .getExecutor<IdentityDatabase>()
      .updateTable(USER_TABLE)
      .set({ email: values.email, password_hash: values.password_hash, role: values.role, updated_at: values.updated_at })
      .where("id", "=", user.id.value)
      .execute();
  }
}
