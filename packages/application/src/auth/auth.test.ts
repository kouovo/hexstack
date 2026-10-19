import {
  type Password,
  PasswordHash,
  type SessionEntity,
  type UserEntity,
  type UserId,
  type UserSpecification,
  NotFoundException,
  EmailAlreadyRegisteredError,
  RateLimiterUnavailableError,
} from "@app/domain";
import { describe, expect, test, vi } from "vitest";

import type { ApplicationTransactionPort } from "../transaction";
import { AssignRoleCommand, AssignRoleCommandHandler } from "../user/commands/assign-role.command";
import type { IUserRepository } from "../user/user.repository.port";
import { SignInCommand, SignInCommandHandler } from "./commands/sign-in.command";
import { SignOutAllCommand, SignOutAllCommandHandler, SignOutCommand, SignOutCommandHandler } from "./commands/sign-out.command";
import { SignUpCommand, SignUpCommandHandler } from "./commands/sign-up.command";
import type { PasswordHasher } from "./password-hasher.port";
import { GetCurrentUserQuery, GetCurrentUserQueryHandler } from "./queries/get-current-user.query";
import type { RateLimiter } from "./rate-limiter.port";
import type { ISessionRepository } from "./session.repository.port";
import { SessionService } from "./session.service";

class InMemoryUsers implements IUserRepository {
  readonly rows = new Map<string, UserEntity>();
  async findOne(spec: UserSpecification) {
    return [...this.rows.values()].find((user) => spec.isSatisfiedBy(user));
  }
  async find(spec: UserSpecification | undefined) {
    return [...this.rows.values()].filter((user) => !spec || spec.isSatisfiedBy(user));
  }
  async insert(user: UserEntity) {
    if ([...this.rows.values()].some((u) => u.email.equals(user.email)))
      throw new EmailAlreadyRegisteredError({ detectedBy: "unique-constraint" });
    this.rows.set(user.id.value, user);
  }
  async update(user: UserEntity) {
    this.rows.set(user.id.value, user);
  }
}

class InMemorySessions implements ISessionRepository {
  readonly rows = new Map<string, SessionEntity>();
  async findById(id: string) {
    return this.rows.get(id);
  }
  async insert(session: SessionEntity) {
    this.rows.set(session.id.value, session);
  }
  async update(session: SessionEntity) {
    this.rows.set(session.id.value, session);
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
  async deleteByUserId(userId: UserId) {
    for (const [id, s] of this.rows) if (s.userId.equals(userId)) this.rows.delete(id);
  }
  async deleteExpired(now: Date) {
    let n = 0;
    for (const [id, s] of this.rows) {
      if (s.isExpired(now)) {
        this.rows.delete(id);
        n++;
      }
    }
    return n;
  }
}

const fakeHasher: PasswordHasher = {
  hash: vi.fn(async (password: Password) => PasswordHash.create(`$fake$${password.reveal()}`)),
  verify: vi.fn(async (hash: PasswordHash, candidate: string) => hash.value === `$fake$${candidate}`),
};

function setup() {
  const users = new InMemoryUsers();
  const sessionRows = new InMemorySessions();
  const sessions = new SessionService(sessionRows, users);
  const limiter = { consume: vi.fn<RateLimiter["consume"]>(async () => true) };
  const order: string[] = [];
  const transaction: ApplicationTransactionPort = {
    run: async (work) => {
      try {
        const result = await work();
        order.push("commit");
        return result;
      } catch (error) {
        order.push("rollback");
        throw error;
      }
    },
  };
  const outbox = { append: vi.fn(async () => {}) };
  const eventBus = { publishMany: vi.fn(async () => {}) } as never;
  return {
    users,
    order,
    outbox,
    sessionRows,
    sessions,
    limiter,
    signUp: new SignUpCommandHandler(users, fakeHasher, limiter, sessions, transaction, outbox, eventBus),
    signIn: new SignInCommandHandler(users, fakeHasher, limiter, sessions),
    signOut: new SignOutCommandHandler(sessions),
    signOutAll: new SignOutAllCommandHandler(sessions),
    assignRole: new AssignRoleCommandHandler(users, transaction, outbox, eventBus),
    me: new GetCurrentUserQueryHandler(users),
  };
}

const ada = { email: "Ada@Example.com", password: "correct horse", clientKey: "127.0.0.1" };

describe("sign-up / sign-in", () => {
  test("sign-up creates a member with a hashed password and a working session", async () => {
    const s = setup();
    const result = await s.signUp.execute(new SignUpCommand(ada));
    expect(result.user).toMatchObject({ email: "ada@example.com", role: "member" });
    expect(result.user).not.toHaveProperty("passwordHash");
    expect([...s.users.rows.values()][0]!.passwordHash.value).toBe("$fake$correct horse");
    expect((await s.sessions.validate(result.token))?.user.id.value).toBe(result.user.id);
  });

  test("the domain password policy is enforced before anything is hashed or stored", async () => {
    const s = setup();
    vi.mocked(fakeHasher.hash).mockClear();
    await expect(s.signUp.execute(new SignUpCommand({ ...ada, password: "short" }))).rejects.toMatchObject({
      _tag: "PasswordPolicyViolationError",
      rule: "Password must be at least 8 characters",
    });
    expect(fakeHasher.hash).not.toHaveBeenCalled();
    expect(s.users.rows.size).toBe(0);
  });

  test("duplicate email (lookup) throws EmailAlreadyRegisteredError, no second hash", async () => {
    const s = setup();
    await s.signUp.execute(new SignUpCommand(ada));
    vi.mocked(fakeHasher.hash).mockClear();
    await expect(s.signUp.execute(new SignUpCommand({ ...ada, email: "ADA@example.com" }))).rejects.toMatchObject({
      _tag: "EmailAlreadyRegisteredError",
      detectedBy: "lookup",
    });
    expect(fakeHasher.hash).not.toHaveBeenCalled();
  });

  test("racing duplicate rolls back: no session, no event", async () => {
    const s = setup();
    await s.signUp.execute(new SignUpCommand(ada));
    s.outbox.append.mockClear();
    const sessionsBefore = s.sessionRows.rows.size;
    vi.spyOn(s.users, "findOne").mockResolvedValueOnce(undefined);
    await expect(s.signUp.execute(new SignUpCommand(ada))).rejects.toMatchObject({
      _tag: "EmailAlreadyRegisteredError",
      detectedBy: "unique-constraint",
    });
    expect(s.order.at(-1)).toBe("rollback");
    expect(s.sessionRows.rows.size).toBe(sessionsBefore);
    expect(s.outbox.append).not.toHaveBeenCalled();
  });

  test("sign-in issues a brand-new session each time", async () => {
    const s = setup();
    const up = await s.signUp.execute(new SignUpCommand(ada));
    const a = await s.signIn.execute(new SignInCommand(ada));
    const b = await s.signIn.execute(new SignInCommand(ada));
    expect(new Set([up.token, a.token, b.token]).size).toBe(3);
    expect(s.sessionRows.rows.size).toBe(3);
  });

  test("unknown email and wrong password throw distinct errors; no session is created", async () => {
    const s = setup();
    const up = await s.signUp.execute(new SignUpCommand(ada));
    await expect(s.signIn.execute(new SignInCommand({ ...ada, email: "bob@example.com" }))).rejects.toMatchObject({
      _tag: "AccountNotFoundError",
    });
    await expect(s.signIn.execute(new SignInCommand({ ...ada, password: "wrong password" }))).rejects.toMatchObject({
      _tag: "IncorrectPasswordError",
      userId: up.user.id,
    });
    expect(s.sessionRows.rows.size).toBe(1);
  });

  test("rate limit is checked before hashing; buckets are per account for sign-in, per client for sign-up", async () => {
    const s = setup();
    await s.signUp.execute(new SignUpCommand(ada));
    expect(s.limiter.consume).toHaveBeenLastCalledWith(expect.objectContaining({ name: "sign-up" }), "127.0.0.1");
    s.limiter.consume.mockResolvedValueOnce(false);
    vi.mocked(fakeHasher.verify).mockClear();
    await expect(s.signIn.execute(new SignInCommand(ada))).rejects.toMatchObject({
      _tag: "RateLimitedError",
      policy: "sign-in",
      retryAfterSeconds: 60,
    });
    expect(fakeHasher.verify).not.toHaveBeenCalled();
    expect(s.limiter.consume).toHaveBeenLastCalledWith(expect.objectContaining({ name: "sign-in" }), "ada@example.com");
    s.limiter.consume.mockResolvedValueOnce(false);
    vi.mocked(fakeHasher.hash).mockClear();
    await expect(s.signUp.execute(new SignUpCommand({ ...ada, email: "other@example.com" }))).rejects.toMatchObject({
      _tag: "RateLimitedError",
      policy: "sign-up",
    });
    expect(fakeHasher.hash).not.toHaveBeenCalled();
  });

  test("an unavailable rate limiter fails closed for both commands, before any hashing", async () => {
    const s = setup();
    await s.signUp.execute(new SignUpCommand(ada));
    const unavailable = new RateLimiterUnavailableError({ policy: "sign-in", cause: new Error("ECONNREFUSED") });
    s.limiter.consume.mockRejectedValue(unavailable);
    vi.mocked(fakeHasher.verify).mockClear();
    vi.mocked(fakeHasher.hash).mockClear();
    await expect(s.signIn.execute(new SignInCommand(ada))).rejects.toBe(unavailable);
    await expect(s.signUp.execute(new SignUpCommand({ ...ada, email: "other@example.com" }))).rejects.toBe(unavailable);
    expect(fakeHasher.verify).not.toHaveBeenCalled();
    expect(fakeHasher.hash).not.toHaveBeenCalled();
  });

  test("infrastructure failures still throw unchanged", async () => {
    const s = setup();
    const failure = new Error("connection terminated");
    vi.spyOn(s.users, "findOne").mockRejectedValueOnce(failure);
    await expect(s.signIn.execute(new SignInCommand(ada))).rejects.toBe(failure);
  });

  test("current user: a deleted user throws SessionUserMissingError", async () => {
    await expect(setup().me.execute(new GetCurrentUserQuery("usr_deleted"))).rejects.toMatchObject({
      _tag: "SessionUserMissingError",
      userId: "usr_deleted",
    });
  });
});

describe("sessions", () => {
  test("tampered, unknown and malformed tokens are rejected", async () => {
    const s = setup();
    const { token } = await s.signUp.execute(new SignUpCommand(ada));
    const [id] = token.split(".");
    expect(await s.sessions.validate(`${id}.${"A".repeat(43)}`)).toBeNull();
    expect(await s.sessions.validate(`${"B".repeat(20)}.${token.split(".")[1]}`)).toBeNull();
    expect(await s.sessions.validate("garbage")).toBeNull();
  });
  test("expired sessions are rejected and deleted", async () => {
    const s = setup();
    const { token } = await s.signUp.execute(new SignUpCommand(ada));
    expect(await s.sessions.validate(token, new Date(Date.now() + 31 * 24 * 3600_000))).toBeNull();
    expect(s.sessionRows.rows.size).toBe(0);
  });
  test("validation slides the expiry at most once per interval", async () => {
    const s = setup();
    const { token } = await s.signUp.execute(new SignUpCommand(ada));
    expect((await s.sessions.validate(token))?.refreshed).toBe(false);
    expect((await s.sessions.validate(token, new Date(Date.now() + 2 * 3600_000)))?.refreshed).toBe(true);
  });
  test("sign-out deletes this session; sign-out-all deletes every session of the user", async () => {
    const s = setup();
    const up = await s.signUp.execute(new SignUpCommand(ada));
    const other = await s.signIn.execute(new SignInCommand(ada));
    const first = await s.sessions.validate(up.token);
    await s.signOut.execute(new SignOutCommand({ sessionId: first!.session.id.value }));
    expect(await s.sessions.validate(up.token)).toBeNull();
    expect(await s.sessions.validate(other.token)).not.toBeNull();
    await s.signOutAll.execute(new SignOutAllCommand({ userId: up.user.id }));
    expect(await s.sessions.validate(other.token)).toBeNull();
  });
});

describe("roles", () => {
  test("assignRole takes effect on the next validation", async () => {
    const s = setup();
    const { token, user } = await s.signUp.execute(new SignUpCommand(ada));
    expect((await s.me.execute(new GetCurrentUserQuery(user.id))).permissions).toEqual({ todo: ["create", "read", "complete"] });
    await s.assignRole.execute(new AssignRoleCommand({ userId: user.id, role: "admin" }));
    expect((await s.sessions.validate(token))?.user.role.value).toBe("admin");
    expect((await s.me.execute(new GetCurrentUserQuery(user.id))).permissions.user).toEqual(["list", "assignRole"]);
  });
  test("unknown user -> NotFoundException", async () => {
    await expect(setup().assignRole.execute(new AssignRoleCommand({ userId: "usr_missing", role: "admin" }))).rejects.toThrow(
      NotFoundException,
    );
  });
});
