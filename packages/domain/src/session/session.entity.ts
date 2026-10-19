import { AggregateRoot, type IEntityState, IdentifierValue } from "@app/core";

import type { UserId } from "../user";

/** How long an idle session lives. Each use pushes the expiry out again (sliding). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Write the new expiry at most this often, not on every request. */
export const SESSION_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export class SessionId extends IdentifierValue {
  private constructor(value: string) {
    super(value);
  }

  static rehydrate(value: string): SessionId {
    return new SessionId(value);
  }
}

export interface ISessionState extends IEntityState<SessionId> {
  userId: UserId;
  /** SHA-256 of the session secret, hex. The secret itself is only ever held by the client. */
  secretHash: string;
  expiresAt: Date;
  refreshedAt: Date;
  createdAt: Date;
}

/**
 * Server-side auth session. One session per successful sign-in; never re-used across sign-ins.
 * Token generation/hashing lives in the application layer (session-token.ts).
 */
export class SessionEntity extends AggregateRoot<ISessionState> {
  get userId(): UserId {
    return this.state.userId;
  }

  get secretHash(): string {
    return this.state.secretHash;
  }

  get expiresAt(): Date {
    return this.state.expiresAt;
  }

  get refreshedAt(): Date {
    return this.state.refreshedAt;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }

  static start(props: { id: string; userId: UserId; secretHash: string; at?: Date }): SessionEntity {
    const now = props.at ?? new Date();
    return new SessionEntity({
      id: SessionId.rehydrate(props.id),
      userId: props.userId,
      secretHash: props.secretHash,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      refreshedAt: now,
      createdAt: now,
    });
  }

  static rehydrate(state: ISessionState): SessionEntity {
    return new SessionEntity({ ...state });
  }

  isExpired(now = new Date()): boolean {
    return now.getTime() >= this.state.expiresAt.getTime();
  }

  /** Slides the expiry forward if the last refresh is older than SESSION_REFRESH_INTERVAL_MS. Returns true if changed. */
  refreshIfDue(now = new Date()): boolean {
    if (now.getTime() - this.state.refreshedAt.getTime() < SESSION_REFRESH_INTERVAL_MS) return false;
    this.state.refreshedAt = now;
    this.state.expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    return true;
  }
}
