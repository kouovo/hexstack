import { inject } from "@app/di";
import type { SessionEntity, UserId } from "@app/domain";

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
  /** Persists expires_at / refreshed_at after a sliding refresh. */
  update(session: SessionEntity): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByUserId(userId: UserId): Promise<void>;
  /** Housekeeping; returns how many rows were removed. */
  deleteExpired(now: Date): Promise<number>;
}

export const SESSION_REPO = Symbol.for("SESSION_REPO");
export const injectSessionRepo = () => inject(SESSION_REPO);
