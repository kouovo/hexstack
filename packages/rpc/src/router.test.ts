import {
  APPLICATION_TRANSACTION_PORT,
  CACHE,
  type ITodoRepository,
  type IUserRepository,
  OUTBOX_REPO,
  PASSWORD_HASHER,
  RATE_LIMITER,
  registerDomainCqrsHandlers,
  SESSION_REPO,
  TODO_REPO,
  USER_REPO,
} from "@app/application";
import { type RequestPrincipal, requestContextStorage } from "@app/context";
import { container } from "@app/di";
import { PasswordHash, type TodoEntity, UserEmail, UserEntity, UserRole } from "@app/domain";
import { createRouterClient } from "@orpc/server";
import { beforeAll, describe, expect, test, vi } from "vitest";

import { router } from "./router";

const todos = new Map<string, TodoEntity>();
const todoRepo: ITodoRepository = {
  insert: async (todo) => void todos.set(todo.id.value, todo),
  findOne: async (spec) => [...todos.values()].find((todo) => spec.isSatisfiedBy(todo)),
  find: async (spec) => [...todos.values()].filter((todo) => !spec || spec.isSatisfiedBy(todo)),
  updateIfStatus: async () => true,
  markCompletionNotified: async () => true,
};

const users = new Map<string, UserEntity>();
const userRepo: IUserRepository = {
  findOne: async (spec) => [...users.values()].find((user) => spec.isSatisfiedBy(user)),
  find: async (spec) => [...users.values()].filter((user) => !spec || spec.isSatisfiedBy(user)),
  insert: async (user) => {
    users.set(user.id.value, user);
  },
  update: async (user) => void users.set(user.id.value, user),
};

function seedUser(role: string): RequestPrincipal {
  const user = UserEntity.signUp({
    email: UserEmail.create(`${role}-${users.size}@example.com`),
    passwordHash: PasswordHash.rehydrate("$stub"),
    role: UserRole.create(role),
  });
  users.set(user.id.value, user);
  return { userId: user.id.value, sessionId: `sess-${role}`, role };
}

beforeAll(() => {
  container.register(TODO_REPO, { useValue: todoRepo });
  container.register(USER_REPO, { useValue: userRepo });
  container.register(OUTBOX_REPO, { useValue: { insert: vi.fn() } });
  // Sign-up/sign-in over HTTP (cookies, CSRF) are covered in apps/api/src/app.test.ts.
  container.register(PASSWORD_HASHER, { useValue: {} });
  container.register(RATE_LIMITER, { useValue: {} });
  container.register(SESSION_REPO, { useValue: {} });
  container.register(APPLICATION_TRANSACTION_PORT, { useValue: { run: (work: () => Promise<unknown>) => work() } });
  container.register(CACHE, {
    useValue: {
      getOrSetVersioned: (_namespace: string, load: () => Promise<unknown>) => load(),
      bumpVersion: async () => {},
    },
  });
  registerDomainCqrsHandlers();
});

/** A router client acting as `principal` (what the HTTP auth middleware sets up per request). */
function clientAs(principal?: RequestPrincipal) {
  const client = createRouterClient(router, { context: () => ({ resHeaders: new Headers() }) });
  const run = <T>(fn: (c: typeof client) => Promise<T>) => requestContextStorage.run({ requestId: "test", principal }, () => fn(client));
  return run;
}

describe("authentication (secure by default)", () => {
  test("anonymous callers get 401 on every non-public procedure", async () => {
    const anon = clientAs();
    await expect(anon((c) => c.todo.list())).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anon((c) => c.todo.create({ title: "x" }))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anon((c) => c.user.list())).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anon((c) => c.auth.signOut())).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("public procedures work anonymously; auth.me is null when signed out", async () => {
    const anon = clientAs();
    expect(await anon((c) => c.ping())).toBe("pong");
    expect(await anon((c) => c.auth.me())).toBeNull();
  });

  test("auth.me returns the user and their effective permissions", async () => {
    const member = clientAs(seedUser("member"));
    expect(await member((c) => c.auth.me())).toMatchObject({
      user: { role: "member" },
      permissions: { todo: ["create", "read", "complete"] },
    });
  });
});

describe("RBAC via meta.permissions", () => {
  test("viewer: read only", async () => {
    const viewer = clientAs(seedUser("viewer"));
    await expect(viewer((c) => c.todo.list())).resolves.toEqual(expect.any(Array));
    await expect(viewer((c) => c.todo.create({ title: "nope" }))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("member: create + complete, but not archive or user management", async () => {
    const member = clientAs(seedUser("member"));
    const todo = await member((c) => c.todo.create({ title: "via rpc" }));
    expect((await member((c) => c.todo.complete({ todoId: todo.id }))).status).toBe("completed");
    await expect(member((c) => c.todo.archive({ todoId: todo.id }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member((c) => c.user.list())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("admin: archive and assign roles", async () => {
    const admin = clientAs(seedUser("admin"));
    const target = seedUser("viewer");
    const todo = await admin((c) => c.todo.create({ title: "admin" }));
    expect((await admin((c) => c.todo.archive({ todoId: todo.id }))).status).toBe("archived");
    expect(await admin((c) => c.user.assignRole({ userId: target.userId, role: "member" }))).toMatchObject({ role: "member" });
    expect((await admin((c) => c.user.list())).map((u) => u.role)).toContain("admin");
  });

  test("domain errors still map to typed errors behind the RBAC check", async () => {
    const member = clientAs(seedUser("member"));
    await expect(member((c) => c.todo.complete({ todoId: "todo_missing" }))).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "This todo no longer exists. Refresh the list.",
      data: { _tag: "TodoNotFoundError", metadata: { todoId: "todo_missing" } },
    });
    await expect(member((c) => c.todo.create({ title: "" }))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("todo status changes: thrown domain errors -> oRPC boundary", () => {
  test("an illegal transition is a tagged 409 with user-safe wording", async () => {
    const member = clientAs(seedUser("member"));
    const todo = await member((c) => c.todo.create({ title: "twice" }));
    await member((c) => c.todo.complete({ todoId: todo.id }));
    const error = await member((c) => c.todo.complete({ todoId: todo.id })).catch((caught) => caught);
    expect(error).toMatchObject({
      code: "CONFLICT",
      status: 409,
      message: "This todo is already completed, so it can't be completed. Refresh to see its current state.",
      data: {
        _tag: "TodoTransitionNotAllowedError",
        metadata: { todoId: todo.id, from: "completed", to: "completed" },
      },
    });
    expect(error.message).not.toContain("todoStatusMachine"); // the internal message stays server-side
  });

  test("losing the concurrent update is a tagged 409", async () => {
    const admin = clientAs(seedUser("admin"));
    const todo = await admin((c) => c.todo.create({ title: "race" }));
    const update = vi.spyOn(todoRepo, "updateIfStatus").mockResolvedValueOnce(false);
    await expect(admin((c) => c.todo.archive({ todoId: todo.id }))).rejects.toMatchObject({
      code: "CONFLICT",
      data: { _tag: "TodoModifiedConcurrentlyError", metadata: { todoId: todo.id } },
    });
    update.mockRestore();
  });

  test("an infrastructure failure inside the use case is a generic 500 that reveals nothing", async () => {
    const member = clientAs(seedUser("member"));
    const todo = await member((c) => c.todo.create({ title: "db down" }));
    const update = vi.spyOn(todoRepo, "updateIfStatus").mockRejectedValueOnce(new Error("terminating connection on host db-primary-7"));
    const error = await member((c) => c.todo.complete({ todoId: todo.id })).catch((caught) => caught);
    update.mockRestore();
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR", status: 500 });
    expect(JSON.stringify(error.toJSON())).not.toContain("db-primary-7");
  });
});
