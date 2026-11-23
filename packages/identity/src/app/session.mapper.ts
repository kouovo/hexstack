import type { SessionRecord } from "../adapters/session.repository";
import { SessionEntity, SessionId } from "../domain/session/session.entity";
import { UserId } from "../domain/user/user-id.value-object";

export interface ISessionDTO {
  id: string;
  expiresAt: string;
}

export function toSessionEntity(record: SessionRecord): SessionEntity {
  return SessionEntity.rehydrate({
    id: SessionId.rehydrate(record.id),
    userId: UserId.rehydrate(record.user_id),
    secretHash: record.secret_hash,
    expiresAt: new Date(record.expires_at),
    refreshedAt: new Date(record.refreshed_at),
    createdAt: new Date(record.created_at),
  });
}

export function toSessionRecord(session: SessionEntity): SessionRecord {
  return {
    id: session.id.value,
    user_id: session.userId.value,
    secret_hash: session.secretHash,
    expires_at: session.expiresAt,
    refreshed_at: session.refreshedAt,
    created_at: session.createdAt,
  };
}

export function toSessionDTO(session: SessionEntity): ISessionDTO {
  return { id: session.id.value, expiresAt: session.expiresAt.toISOString() };
}
