import { type ISessionRepository, SessionMapper } from "@app/application";
import { singleton } from "@app/di";
import type { SessionEntity, UserId } from "@app/domain";

import { SESSION_TABLE } from "../db";
import { type ITransactionManager, injectTransactionManager } from "../transaction";

@singleton()
export class SessionRepository implements ISessionRepository {
  constructor(@injectTransactionManager() private readonly transactions: ITransactionManager) {}

  async findById(id: string): Promise<SessionEntity | undefined> {
    const row = await this.transactions.getExecutor().selectFrom(SESSION_TABLE).selectAll().where("id", "=", id).executeTakeFirst();
    return row ? SessionMapper.toEntity(row) : undefined;
  }

  async insert(session: SessionEntity): Promise<void> {
    await this.transactions.getExecutor().insertInto(SESSION_TABLE).values(SessionMapper.toPersistence(session)).execute();
  }

  async update(session: SessionEntity): Promise<void> {
    await this.transactions
      .getExecutor()
      .updateTable(SESSION_TABLE)
      .set({ expires_at: session.expiresAt, refreshed_at: session.refreshedAt })
      .where("id", "=", session.id.value)
      .execute();
  }

  async delete(id: string): Promise<void> {
    await this.transactions.getExecutor().deleteFrom(SESSION_TABLE).where("id", "=", id).execute();
  }

  async deleteByUserId(userId: UserId): Promise<void> {
    await this.transactions.getExecutor().deleteFrom(SESSION_TABLE).where("user_id", "=", userId.value).execute();
  }

  async deleteExpired(now: Date): Promise<number> {
    const result = await this.transactions.getExecutor().deleteFrom(SESSION_TABLE).where("expires_at", "<=", now).executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
