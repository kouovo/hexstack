import { type ITransactionManager, injectTransactionManager } from "@app/common/db";
import { inject, singleton } from "@app/common/di";

import { toSessionEntity, toSessionRecord } from "../app/session.mapper";
import type { SessionEntity } from "../domain/session/session.entity";
import type { UserId } from "../domain/user/user-id.value-object";
import { type IdentityDatabase, SESSION_TABLE } from "./identity.database";

export interface SessionRecord {
  id: string;
  user_id: string;
  secret_hash: string;
  expires_at: Date;
  refreshed_at: Date;
  created_at: Date;
}

export interface ISessionRepository {
  findById(id: string): Promise<SessionEntity | undefined>;
  insert(session: SessionEntity): Promise<void>;
  update(session: SessionEntity): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByUserId(userId: UserId): Promise<void>;
  /** Returns how many rows were removed. */
  deleteExpired(now: Date): Promise<number>;
}

export const SESSION_REPO = Symbol.for("SESSION_REPO");
export const injectSessionRepo = () => inject(SESSION_REPO);

@singleton()
export class SessionRepository implements ISessionRepository {
  constructor(@injectTransactionManager() private readonly transactions: ITransactionManager) {}

  async findById(id: string): Promise<SessionEntity | undefined> {
    const row = await this.transactions
      .getExecutor<IdentityDatabase>()
      .selectFrom(SESSION_TABLE)
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toSessionEntity(row) : undefined;
  }

  async insert(session: SessionEntity): Promise<void> {
    await this.transactions.getExecutor<IdentityDatabase>().insertInto(SESSION_TABLE).values(toSessionRecord(session)).execute();
  }

  async update(session: SessionEntity): Promise<void> {
    await this.transactions
      .getExecutor<IdentityDatabase>()
      .updateTable(SESSION_TABLE)
      .set({ expires_at: session.expiresAt, refreshed_at: session.refreshedAt })
      .where("id", "=", session.id.value)
      .execute();
  }

  async delete(id: string): Promise<void> {
    await this.transactions.getExecutor<IdentityDatabase>().deleteFrom(SESSION_TABLE).where("id", "=", id).execute();
  }

  async deleteByUserId(userId: UserId): Promise<void> {
    await this.transactions.getExecutor<IdentityDatabase>().deleteFrom(SESSION_TABLE).where("user_id", "=", userId.value).execute();
  }

  async deleteExpired(now: Date): Promise<number> {
    const result = await this.transactions
      .getExecutor<IdentityDatabase>()
      .deleteFrom(SESSION_TABLE)
      .where("expires_at", "<=", now)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
