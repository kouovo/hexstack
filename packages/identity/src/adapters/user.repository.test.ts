import { DomainEventTracker } from "@app/common/cqrs";
import { ApplicationTransactionAdapter } from "@app/common/db";
import { createTestDatabase, type TestDatabase } from "@app/common/db/testing";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

import { SignUpCommandHandler } from "../app/command/sign-up.command";
import { SessionService } from "../app/session.service";
import { PasswordHash } from "../domain/user/password-hash.value-object";
import { UserEmailSpecification } from "../domain/user/specs/user-email.specification";
import { UserIdSpecification } from "../domain/user/specs/user-id.specification";
import { UserPasswordHashSpecification } from "../domain/user/specs/user-password-hash.specification";
import { UserEmail } from "../domain/user/user-email.value-object";
import { UserId } from "../domain/user/user-id.value-object";
import { UserRole } from "../domain/user/user-role.value-object";
import { UserEntity } from "../domain/user/user.entity";
import { SESSION_TABLE, USER_TABLE } from "./identity.database";
import { SessionRepository } from "./session.repository";
import { UserRepository } from "./user.repository";

let db: TestDatabase;
let users: UserRepository;
let sessionRows: SessionRepository;
let sessions: SessionService;
let transaction: ApplicationTransactionAdapter;

const noEvents = { publishMany: async () => [] };

beforeAll(async () => {
  db = await createTestDatabase();
  transaction = new ApplicationTransactionAdapter(db.transactions);
  users = new UserRepository(db.transactions, new DomainEventTracker(transaction, noEvents, noEvents, new Set()));
  sessionRows = new SessionRepository(db.transactions);
  sessions = new SessionService(sessionRows, users);
}, 30_000);
beforeEach(async () => {
  await db.pglite.exec(`DELETE FROM ${SESSION_TABLE}; DELETE FROM ${USER_TABLE};`);
});
afterAll(async () => {
  await db?.close();
});

/** A fixture without pending events, so it can be inserted outside a transaction. */
const newUser = (email = "ada@example.com") => {
  const user = UserEntity.signUp(
    new UserEmailSpecification(UserEmail.create(email)).and(new UserPasswordHashSpecification(PasswordHash.rehydrate("$argon2id$stub"))),
  );
  user.clearDomainEvents();
  return user;
};

test("users round-trip and are found by id / email specs", async () => {
  const user = newUser();
  await users.insert(user);
  expect((await users.findOne(new UserIdSpecification(user.id)))?.email.value).toBe("ada@example.com");
  expect((await users.findOne(new UserEmailSpecification(UserEmail.create("ADA@example.com"))))?.id.value).toBe(user.id.value);
  expect(await users.find(undefined, { limit: 10 })).toHaveLength(1);
});

test("the unique email index turns a racing duplicate into a thrown EmailAlreadyRegisteredError", async () => {
  await expect(users.insert(newUser())).resolves.toBeUndefined();
  await expect(users.insert(newUser())).rejects.toMatchObject({
    _tag: "EmailAlreadyRegisteredError",
    detectedBy: "unique-constraint",
    cause: expect.objectContaining({ code: "23505" }),
  });
});

test("other database failures are not expected failures: they still throw, unchanged", async () => {
  // Unrelated role CHECK violations (23514) keep the original driver error.
  const user = newUser();
  // Bypass UserRole validation so the mapped record carries a role the CHECK constraint rejects.
  Object.defineProperty(user, "role", { value: { value: "superuser" } as unknown as UserRole });
  await expect(users.insert(user)).rejects.toMatchObject({ code: "23514" });
});

test("a racing duplicate inside the sign-up transaction rolls back the account and its session", async () => {
  const handler = new SignUpCommandHandler(
    users,
    { hash: async () => PasswordHash.rehydrate("$stub"), verify: async () => false },
    { consume: async () => true },
    sessions,
    transaction,
  );
  const existing = newUser();
  await users.insert(existing);
  // The pre-check misses (as if the other sign-up had not committed yet); the unique index decides.
  const findOne = users.findOne.bind(users);
  users.findOne = async () => undefined;
  try {
    await expect(handler.execute({ email: "ada@example.com", password: "correct horse", clientKey: "test" })).rejects.toMatchObject({
      _tag: "EmailAlreadyRegisteredError",
      detectedBy: "unique-constraint",
    });
  } finally {
    users.findOne = findOne;
  }
  expect((await users.find(undefined, { limit: 10 })).map((user) => user.id.value)).toEqual([existing.id.value]);
  expect(await db.queryBuilder.selectFrom(SESSION_TABLE).selectAll().execute()).toEqual([]);
});

test("the password hash round-trips as an opaque value object", async () => {
  const user = newUser();
  await users.insert(user);
  const loaded = await users.findOne(new UserIdSpecification(user.id));
  expect(loaded?.passwordHash).toBeInstanceOf(PasswordHash);
  expect(loaded?.passwordHash.value).toBe("$argon2id$stub");
});

test("role changes persist; the CHECK constraint rejects unknown roles at the database too", async () => {
  const user = newUser();
  await users.insert(user);
  user.changeRole(UserRole.create("admin")); // records UserRoleChangedEvent: persisted in a transaction
  await transaction.run(() => users.update(user));
  expect((await users.findOne(new UserIdSpecification(user.id)))?.role.value).toBe("admin");
  await expect(db.pglite.exec(`UPDATE ${USER_TABLE} SET role = 'root'`)).rejects.toThrow();
});

test("sessions: only the secret hash is stored; validate / refresh / revoke work against the table", async () => {
  const user = newUser();
  await users.insert(user);
  const { token, session } = await sessions.start(user.id);

  const row = await db.queryBuilder.selectFrom(SESSION_TABLE).selectAll().executeTakeFirstOrThrow();
  expect(row.secret_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(token).not.toContain(row.secret_hash);
  expect(token.split(".")[1]).not.toBe(row.secret_hash);

  expect((await sessions.validate(token))?.user.id.value).toBe(user.id.value);
  const later = new Date(Date.now() + 2 * 3600_000);
  expect((await sessions.validate(token, later))?.refreshed).toBe(true);
  expect((await sessionRows.findById(session.id.value))!.refreshedAt).toEqual(later);

  await sessions.revoke(session.id.value);
  expect(await sessions.validate(token)).toBeNull();
});

test("expired sessions are cleaned up; deleting a user cascades to their sessions", async () => {
  const user = newUser();
  await users.insert(user);
  await sessions.start(user.id, new Date("2000-01-01T00:00:00Z"));
  const live = await sessions.start(user.id);
  expect(await sessions.deleteExpired()).toBe(1);

  await db.pglite.exec(`DELETE FROM ${USER_TABLE}`);
  expect(await sessionRows.findById(live.session.id.value)).toBeUndefined();
});

test("sign-up rolls back the account when creating its session fails", async () => {
  class FailingSessionRepository extends SessionRepository {
    override async insert(): Promise<void> {
      throw new Error("session insert failed");
    }
  }
  const failedSessions = new SessionService(new FailingSessionRepository(db.transactions), users);
  const handler = new SignUpCommandHandler(
    users,
    { hash: async () => PasswordHash.rehydrate("$stub"), verify: async () => false },
    { consume: async () => true },
    failedSessions,
    transaction,
  );
  await expect(handler.execute({ email: "ada@example.com", password: "correct horse", clientKey: "test" })).rejects.toThrow(
    "session insert failed",
  );
  expect(await users.find(undefined, { limit: 10 })).toEqual([]);
  expect(await db.queryBuilder.selectFrom(SESSION_TABLE).selectAll().execute()).toEqual([]);
});

test("sign-out-all removes every session of that user only", async () => {
  const [a, b] = [newUser("a@example.com"), newUser("b@example.com")];
  await users.insert(a);
  await users.insert(b);
  await sessions.start(a.id);
  await sessions.start(a.id);
  const keep = await sessions.start(b.id);
  await sessions.revokeAll(UserId.create(a.id.value));
  expect(await db.queryBuilder.selectFrom(SESSION_TABLE).select("id").execute()).toEqual([{ id: keep.session.id.value }]);
});
