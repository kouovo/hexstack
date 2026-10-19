import { SessionService, SignUpCommand, SignUpCommandHandler, UserMapper } from "@app/application";
import { PasswordHash, UserEmail, UserEmailSpecification, UserEntity, UserId, UserIdSpecification, UserRole } from "@app/domain";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { SESSION_TABLE, USER_TABLE } from "../db";
import { SessionRepository } from "../session/session.repository";
import { createTestDatabase, type TestDatabase } from "../testing/test-database";
import { ApplicationTransactionAdapter } from "../transaction/application-transaction-adapter";
import { UserRepository } from "./user.repository";

let db: TestDatabase;
let users: UserRepository;
let sessionRows: SessionRepository;
let sessions: SessionService;

beforeAll(async () => {
  db = await createTestDatabase();
  users = new UserRepository(db.transactions);
  sessionRows = new SessionRepository(db.transactions);
  sessions = new SessionService(sessionRows, users);
}, 30_000);
beforeEach(async () => {
  await db.pglite.exec(`DELETE FROM ${SESSION_TABLE}; DELETE FROM ${USER_TABLE};`);
});
afterAll(async () => {
  await db?.close();
});

const newUser = (email = "ada@example.com") =>
  UserEntity.signUp({ email: UserEmail.create(email), passwordHash: PasswordHash.rehydrate("$argon2id$stub") });

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
  const toPersistence = vi.spyOn(UserMapper, "toPersistence").mockImplementationOnce((user) => ({
    ...UserMapper.toPersistence(user),
    role: "superuser",
  }));
  try {
    await expect(users.insert(newUser())).rejects.toMatchObject({ code: "23514" });
  } finally {
    toPersistence.mockRestore();
  }
});

test("a racing duplicate inside the sign-up transaction rolls back the account and its session", async () => {
  const handler = new SignUpCommandHandler(
    users,
    { hash: async () => PasswordHash.rehydrate("$stub"), verify: async () => false },
    { consume: async () => true },
    sessions,
    new ApplicationTransactionAdapter(db.transactions),
    { append: async () => {} },
    { publish: async () => {}, publishMany: async () => {} },
  );
  const existing = newUser();
  await users.insert(existing);
  // The pre-check misses (as if the other sign-up had not committed yet); the unique index decides.
  const findOne = users.findOne.bind(users);
  users.findOne = async () => undefined;
  try {
    await expect(
      handler.execute(new SignUpCommand({ email: "ada@example.com", password: "correct horse", clientKey: "test" })),
    ).rejects.toMatchObject({ _tag: "EmailAlreadyRegisteredError", detectedBy: "unique-constraint" });
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
  user.changeRole(UserRole.create("admin"));
  await users.update(user);
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
    new ApplicationTransactionAdapter(db.transactions),
    { append: async () => {} },
    { publish: async () => {}, publishMany: async () => {} },
  );
  await expect(
    handler.execute(new SignUpCommand({ email: "ada@example.com", password: "correct horse", clientKey: "test" })),
  ).rejects.toThrow("session insert failed");
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
