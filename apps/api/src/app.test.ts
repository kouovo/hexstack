import {
  APPLICATION_TRANSACTION_PORT,
  CACHE,
  type ISessionRepository,
  type ITodoRepository,
  type IUserRepository,
  OUTBOX_REPO,
  PASSWORD_HASHER,
  RATE_LIMITER,
  type RateLimiter,
  registerDomainCqrsHandlers,
  SESSION_REPO,
  TODO_REPO,
  USER_REPO,
} from "@app/application";
import { container } from "@app/di";
import {
  type Password,
  PasswordHash,
  SessionEntity,
  type TodoEntity,
  type UserEntity,
  UserRole,
  RateLimiterUnavailableError,
} from "@app/domain";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { createApp } from "./app";

// Real Hono -> authentication -> oRPC -> CQRS -> SessionService, with in-memory port adapters.
const todos = new Map<string, TodoEntity>();
const users = new Map<string, UserEntity>();
const sessions = new Map<string, SessionEntity>();
const consume = vi.fn<RateLimiter["consume"]>(async () => true);
const todoRepo: ITodoRepository = {
  insert: async (todo) => void todos.set(todo.id.value, todo),
  findOne: async (spec) => [...todos.values()].find((todo) => spec.isSatisfiedBy(todo)),
  find: async (spec) => [...todos.values()].filter((todo) => !spec || spec.isSatisfiedBy(todo)),
  updateIfStatus: async () => true,
  markCompletionNotified: async () => true,
};
const userRepo: IUserRepository = {
  insert: async (user) => {
    users.set(user.id.value, user);
  },
  update: async (user) => void users.set(user.id.value, user),
  findOne: async (spec) => [...users.values()].find((user) => spec.isSatisfiedBy(user)),
  find: async (spec) => [...users.values()].filter((user) => !spec || spec.isSatisfiedBy(user)),
};
const sessionRepo: ISessionRepository = {
  findById: async (id) => sessions.get(id),
  insert: async (session) => void sessions.set(session.id.value, session),
  update: async (session) => void sessions.set(session.id.value, session),
  delete: async (id) => void sessions.delete(id),
  deleteByUserId: async (id) => {
    for (const [key, session] of sessions) if (session.userId.equals(id)) sessions.delete(key);
  },
  deleteExpired: async () => 0,
};

beforeAll(() => {
  container.register(TODO_REPO, { useValue: todoRepo });
  container.register(USER_REPO, { useValue: userRepo });
  container.register(SESSION_REPO, { useValue: sessionRepo });
  container.register(PASSWORD_HASHER, {
    useValue: {
      hash: async (password: Password) => PasswordHash.create(`$fake$${password.reveal()}`),
      verify: async (hash: PasswordHash, candidate: string) => hash.value === `$fake$${candidate}`,
    },
  });
  container.register(RATE_LIMITER, { useValue: { consume } });
  container.register(OUTBOX_REPO, { useValue: { insert: async () => {} } });
  container.register(APPLICATION_TRANSACTION_PORT, { useValue: { run: (work: () => Promise<unknown>) => work() } });
  container.register(CACHE, {
    useValue: {
      getOrSetVersioned: (_namespace: string, load: () => Promise<unknown>) => load(),
      bumpVersion: async () => {},
    },
  });
  registerDomainCqrsHandlers();
});
beforeEach(() => {
  todos.clear();
  users.clear();
  sessions.clear();
  consume.mockReset().mockResolvedValue(true);
});

const WEB_ORIGIN = "http://localhost:3000";
const rpcErrorBody = async (res: Response) => {
  const { json } = (await res.json()) as { json: { message: string; data: { _tag: string } } };
  expect(json.data).not.toHaveProperty("code");
  return json;
};
const app = createApp({ trustedOrigins: [WEB_ORIGIN] });
const post = (path: string, json?: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ json }) });
const ada = { email: "ada@example.com", password: "correct horse" };
const cookieFrom = (res: Response) => res.headers.get("set-cookie")!.split(";")[0]!;
async function signUp() {
  const res = await post("/rpc/auth/signUp", ada);
  expect(res.status).toBe(200);
  return cookieFrom(res);
}

function requireRefresh(cookie: string) {
  const id = cookie.slice("__Host-app_session=".length).split(".")[0]!;
  const session = sessions.get(id)!;
  sessions.set(
    id,
    SessionEntity.rehydrate({
      id: session.id,
      userId: session.userId,
      secretHash: session.secretHash,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      refreshedAt: new Date(Date.now() - 2 * 3600_000),
    }),
  );
}

// No secrets are ever part of a public DTO, regardless of the route.
function expectNoSecrets(json: unknown) {
  const body = JSON.stringify(json);
  for (const key of ["passwordHash", "password_hash", "secretHash", "secret_hash", "token"]) expect(body).not.toContain(key);
  expect(body).not.toContain(ada.password);
}

describe("todo use cases over HTTP", () => {
  test("GET /todos lists the caller's readable todos as plain JSON", async () => {
    expect((await app.request("/todos")).status).toBe(401);
    const cookie = await signUp();
    await post("/rpc/todo/create", { title: "ship the rest example" }, { cookie });
    await post("/rpc/todo/create", { title: "leave this open" }, { cookie });

    const listed = await app.request("/todos?status=open&limit=10", { headers: { cookie } });
    expect(listed.status).toBe(200);
    expect(listed.headers.get("content-type")).toContain("application/json");
    const body = (await listed.json()) as { todos: { title: string; status: string }[] };
    expect(body.todos.map((todo) => todo.title)).toEqual(expect.arrayContaining(["leave this open", "ship the rest example"]));
    expect(body.todos).toHaveLength(2);
    expect(body.todos.every((todo) => todo.status === "open")).toBe(true);
    expectNoSecrets(body);

    expect((await app.request("/todos?status=nope", { headers: { cookie } })).status).toBe(400);
    expect((await app.request("/todos?limit=0", { headers: { cookie } })).status).toBe(400);
    [...users.values()][0]!.changeRole(UserRole.create("viewer"));
    expect((await app.request("/todos", { headers: { cookie } })).status).toBe(200);
  });

  test("authenticated members can create and complete a todo, but cannot complete it twice", async () => {
    expect((await post("/rpc/todo/create", { title: "over http" })).status).toBe(401);
    const cookie = await signUp();
    const created = await post("/rpc/todo/create", { title: "over http" }, { cookie });
    expect(created.status).toBe(200);
    const { json: todo } = (await created.json()) as { json: { id: string; status: string } };
    expect(todo.status).toBe("open");
    expect((await post("/rpc/todo/complete", { todoId: todo.id }, { cookie })).status).toBe(200);
    // Thrown domain errors are mapped centrally to 409 with a stable tag.
    const again = await post("/rpc/todo/complete", { todoId: todo.id }, { cookie });
    expect(again.status).toBe(409);
    expect((await rpcErrorBody(again)).data).toMatchObject({ _tag: "TodoTransitionNotAllowedError" });
  });
});

describe("cookie sessions", () => {
  test("sign-up always creates a member; the session is cookie-only, HttpOnly, and not cached", async () => {
    const res = await post("/rpc/auth/signUp", { ...ada, role: "admin" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(
      /^__Host-app_session=[\w-]+\.[\w-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/,
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect([...users.values()][0]!.role.value).toBe("member");
    expectNoSecrets(await res.json());
    const me = await app.request("/rpc/auth/me", { headers: { cookie: cookieFrom(res) } });
    expect(await me.json()).toMatchObject({ json: { user: { email: ada.email, role: "member" } } });
    expect(await (await app.request("/rpc/auth/me")).json()).toEqual({ json: null });
  });

  test("sign-in issues fresh sessions; duplicate email, bad password and rate limits map correctly", async () => {
    const first = await signUp();
    expect((await post("/rpc/auth/signUp", ada)).status).toBe(409);
    expect((await post("/rpc/auth/signIn", { ...ada, password: "wrong" })).status).toBe(401);
    const res = await post("/rpc/auth/signIn", ada);
    expect(res.status).toBe(200);
    expect(cookieFrom(res)).not.toBe(first);
    expectNoSecrets(await res.json());
    consume.mockResolvedValue(false);
    expect((await post("/rpc/auth/signIn", ada)).status).toBe(429);
    expect((await post("/rpc/auth/signUp", { ...ada, email: "other@example.com" })).status).toBe(429);
  });

  test("auth failures have tag-only data and user-facing messages", async () => {
    await signUp();
    const duplicate = await post("/rpc/auth/signUp", ada);
    expect([duplicate.status, (await rpcErrorBody(duplicate)).data._tag]).toEqual([409, "EmailAlreadyRegisteredError"]);
    const unknown = await post("/rpc/auth/signIn", { ...ada, email: "nobody@example.com" });
    expect([unknown.status, (await rpcErrorBody(unknown)).data._tag]).toEqual([404, "AccountNotFoundError"]);
    const wrong = await post("/rpc/auth/signIn", { ...ada, password: "wrong" });
    expect(await rpcErrorBody(wrong)).toMatchObject({ message: "Incorrect password.", data: { _tag: "IncorrectPasswordError" } });
  });

  test("a rate-limiter outage is 503 (was a 500 leaking the Redis error) and never issues a session", async () => {
    await signUp();
    consume.mockRejectedValue(
      new RateLimiterUnavailableError({ policy: "sign-in", cause: new Error("connect ECONNREFUSED 10.0.0.5:6379") }),
    );
    const res = await post("/rpc/auth/signIn", ada);
    expect(res.status).toBe(503);
    expect(res.headers.get("set-cookie")).toBeNull();
    const text = await res.text();
    expect(text).toContain("RateLimiterUnavailableError");
    expect(text).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|Redis/);
  });

  test("invalid or expired cookies are cleared and never authenticate", async () => {
    const cookie = await signUp();
    const tampered = `${cookie.slice(0, -1)}!`;
    const invalid = await app.request("/rpc/todo/list", { headers: { cookie: tampered } });
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get("set-cookie")).toContain("Max-Age=0");
    const [id, session] = [...sessions.entries()][0]!;
    sessions.set(
      id,
      SessionEntity.rehydrate({
        id: session.id,
        userId: session.userId,
        secretHash: session.secretHash,
        expiresAt: new Date(0),
        refreshedAt: session.refreshedAt,
        createdAt: session.createdAt,
      }),
    );
    expect((await app.request("/rpc/todo/list", { headers: { cookie } })).status).toBe(401);
    expect(sessions.size).toBe(0);
  });

  test("sliding refresh updates the cookie, including on oRPC responses", async () => {
    const cookie = await signUp();
    requireRefresh(cookie);
    const res = await app.request("/rpc/auth/me", { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain(`${cookie};`);
  });

  test("login/logout cookies supersede a pending refresh or invalid-cookie cleanup", async () => {
    const cookie = await signUp();
    requireRefresh(cookie);
    const signedIn = await post("/rpc/auth/signIn", ada, { cookie });
    expect(signedIn.headers.getSetCookie()).toHaveLength(1);
    expect(cookieFrom(signedIn)).not.toBe(cookie);

    const fresh = cookieFrom(signedIn);
    requireRefresh(fresh);
    const signedOut = await post("/rpc/auth/signOut", undefined, { cookie: fresh });
    expect(signedOut.headers.getSetCookie()).toHaveLength(1);
    expect(signedOut.headers.get("set-cookie")).toContain("Max-Age=0");

    const invalid = await post("/rpc/auth/signIn", ada, { cookie: "__Host-app_session=invalid" });
    expect(invalid.headers.getSetCookie()).toHaveLength(1);
    expect(invalid.headers.get("set-cookie")).not.toContain("Max-Age=0");
  });

  test("sign-out revokes the server session; sign-out-all revokes the rest", async () => {
    const cookie = await signUp();
    const other = cookieFrom(await post("/rpc/auth/signIn", ada));
    const out = await post("/rpc/auth/signOut", undefined, { cookie });
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await app.request("/rpc/todo/list", { headers: { cookie } })).status).toBe(401);
    expect((await post("/rpc/auth/signOutAll", undefined, { cookie: other })).status).toBe(200);
    expect(sessions.size).toBe(0);
  });

  test("a role change affects the very next request, without reissuing the session", async () => {
    const cookie = await signUp();
    expect((await app.request("/rpc/user/list", { headers: { cookie } })).status).toBe(403);
    [...users.values()][0]!.changeRole(UserRole.create("admin"));
    const res = await app.request("/rpc/user/list", { headers: { cookie } });
    expect(res.status).toBe(200);
    expectNoSecrets(await res.json());
    [...users.values()][0]!.changeRole(UserRole.create("viewer"));
    expect((await post("/rpc/todo/create", { title: "nope" }, { cookie })).status).toBe(403);
  });
});

describe("CSRF", () => {
  test.each(["https://evil.example", "http://localhost:3000.evil.example", "null"])(
    "rejects untrusted Origin %s before executing any write",
    async (origin) => {
      const res = await post("/rpc/auth/signUp", ada, { origin });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ _tag: "ForbiddenException", message: "Cross-site request blocked" });
      expect(users.size).toBe(0);
    },
  );

  test("rejects cross-site requests without Origin; permits trusted and same-origin browser requests", async () => {
    expect((await post("/rpc/auth/signUp", ada, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post("/rpc/auth/signUp", ada, { origin: WEB_ORIGIN, "sec-fetch-site": "same-site" })).status).toBe(200);
    expect((await post("/rpc/auth/signIn", ada, { origin: "http://localhost", "sec-fetch-site": "same-origin" })).status).toBe(200);
  });

  test("GET cannot invoke mutations (oRPC needs StrictGetMethodPlugin, route metadata alone is insufficient)", async () => {
    const data = encodeURIComponent(JSON.stringify({ json: ada }));
    expect((await app.request(`/rpc/auth/signUp?data=${data}`)).status).toBe(405);
    expect(users.size).toBe(0);
    const cookie = await signUp();
    expect((await app.request("/rpc/auth/signOut", { headers: { cookie } })).status).toBe(405);
    expect(sessions.size).toBe(1);
  });
});
