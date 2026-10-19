import { type IUserRepository, UserMapper } from "@app/application";
import { singleton } from "@app/di";
import { EmailAlreadyRegisteredError, type UserEntity, type UserSpecification } from "@app/domain";

import { USER_TABLE } from "../db";
import { type ITransactionManager, injectTransactionManager } from "../transaction";
import { UserQueryVisitor } from "./user.query-visitor";

const UNIQUE_VIOLATION = "23505";

@singleton()
export class UserRepository implements IUserRepository {
  constructor(@injectTransactionManager() private readonly transactions: ITransactionManager) {}

  async findOne(spec: UserSpecification): Promise<UserEntity | undefined> {
    const row = await this.transactions
      .getExecutor()
      .selectFrom(USER_TABLE)
      .selectAll()
      .where((eb) => new UserQueryVisitor(eb).$where(spec))
      .executeTakeFirst();
    return row ? UserMapper.toEntity(row) : undefined;
  }

  async find(spec: UserSpecification | undefined, { limit }: { limit: number }): Promise<UserEntity[]> {
    const rows = await this.transactions
      .getExecutor()
      .selectFrom(USER_TABLE)
      .selectAll()
      .where((eb) => new UserQueryVisitor(eb).$where(spec))
      .orderBy("created_at", "asc")
      .orderBy("id", "asc")
      .limit(limit)
      .execute();
    return rows.map((row) => UserMapper.toEntity(row));
  }

  async insert(user: UserEntity): Promise<void> {
    try {
      await this.transactions.getExecutor().insertInto(USER_TABLE).values(UserMapper.toPersistence(user)).execute();
    } catch (cause) {
      // Only translate the expected unique violation; preserve unexpected errors unchanged.
      if ((cause as { code?: string } | null)?.code === UNIQUE_VIOLATION) {
        throw new EmailAlreadyRegisteredError({ detectedBy: "unique-constraint", cause });
      }
      throw cause;
    }
  }

  async update(user: UserEntity): Promise<void> {
    const values = UserMapper.toPersistence(user);
    await this.transactions
      .getExecutor()
      .updateTable(USER_TABLE)
      .set({ email: values.email, password_hash: values.password_hash, role: values.role, updated_at: values.updated_at })
      .where("id", "=", user.id.value)
      .execute();
  }
}
