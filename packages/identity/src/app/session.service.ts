import { inject, singleton } from "@app/common/di";

import { type ISessionRepository, injectSessionRepo } from "../adapters/session.repository";
import { type IUserRepository, injectUserRepo } from "../adapters/user.repository";
import { SessionEntity } from "../domain/session/session.entity";
import { UserIdSpecification } from "../domain/user/specs/user-id.specification";
import type { UserId } from "../domain/user/user-id.value-object";
import type { UserEntity } from "../domain/user/user.entity";
import { generateSessionToken, parseSessionToken, secretHashMatches } from "./session-token";

export interface StartedSession {
  session: SessionEntity;
  /** Give this to the client exactly once (cookie). It is never stored. */
  token: string;
}

export interface ValidatedSession {
  user: UserEntity;
  session: SessionEntity;
  /** True when the expiry slid forward; the caller should re-issue the cookie. */
  refreshed: boolean;
}

@singleton()
export class SessionService {
  constructor(
    @injectSessionRepo() private readonly sessions: ISessionRepository,
    @injectUserRepo() private readonly users: IUserRepository,
  ) {}

  /** Always a brand-new session: never re-use one across sign-ins. */
  async start(userId: UserId, at = new Date()): Promise<StartedSession> {
    const { id, token, secretHash } = generateSessionToken();
    const session = SessionEntity.start({ id, userId, secretHash, at });
    await this.sessions.insert(session);
    return { session, token };
  }

  /** Expired sessions are deleted on sight. */
  async validate(token: string, now = new Date()): Promise<ValidatedSession | null> {
    const parsed = parseSessionToken(token);
    if (!parsed) return null;

    const session = await this.sessions.findById(parsed.id);
    if (!session || !secretHashMatches(session.secretHash, parsed.secret)) return null;
    if (session.isExpired(now)) {
      await this.sessions.delete(session.id.value);
      return null;
    }

    const user = await this.users.findOne(new UserIdSpecification(session.userId));
    if (!user) return null;

    const refreshed = session.refreshIfDue(now);
    if (refreshed) await this.sessions.update(session);
    return { user, session, refreshed };
  }

  revoke(sessionId: string): Promise<void> {
    return this.sessions.delete(sessionId);
  }

  revokeAll(userId: UserId): Promise<void> {
    return this.sessions.deleteByUserId(userId);
  }

  deleteExpired(now = new Date()): Promise<number> {
    return this.sessions.deleteExpired(now);
  }
}

export const injectSessionService = () => inject(SessionService);
