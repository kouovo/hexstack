import type { IMapper } from "@app/core";
import { SessionEntity, SessionId, UserId } from "@app/domain";

import type { SessionRecord } from "./session.repository.port";

export interface ISessionDTO {
  id: string;
  expiresAt: string;
}

export const SessionMapper: IMapper<SessionEntity, SessionRecord, ISessionDTO> = {
  toEntity(record) {
    return SessionEntity.rehydrate({
      id: SessionId.rehydrate(record.id),
      userId: UserId.rehydrate(record.user_id),
      secretHash: record.secret_hash,
      expiresAt: new Date(record.expires_at),
      refreshedAt: new Date(record.refreshed_at),
      createdAt: new Date(record.created_at),
    });
  },

  toPersistence(session) {
    return {
      id: session.id.value,
      user_id: session.userId.value,
      secret_hash: session.secretHash,
      expires_at: session.expiresAt,
      refreshed_at: session.refreshedAt,
      created_at: session.createdAt,
    };
  },

  toResponse(session) {
    return { id: session.id.value, expiresAt: session.expiresAt.toISOString() };
  },
};
