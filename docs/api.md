# API

- [Endpoints](#endpoints)
- [HTTP pipeline](#http-pipeline)
- [RPC procedures](#rpc-procedures)
- [REST: `GET /todos`](#rest-get-todos)
- [Calling the API with curl](#calling-the-api-with-curl)
- [Web client](#web-client)
- [CLI](#cli)

## Endpoints

| Path        | Description                                                                          |
| ----------- | ------------------------------------------------------------------------------------ |
| `/health`   | `{ "status": "ok" }`                                                                  |
| `/rpc/*`    | oRPC router from [`@app/api-contract`](../packages/api-contract/src/router.ts)        |
| `/todos`    | REST example, served by the todo context's [HTTP port](../packages/todo/src/ports/http.ts) |

[`createApp()`](../apps/api/src/app.ts) builds the Hono app and does not register DI;
[`index.ts`](../apps/api/src/index.ts) registers DI, starts the server, the outbox relay and the maintenance jobs, and
handles `SIGTERM`/`SIGINT`. Tests call `createApp()` with `app.request()`.

## HTTP pipeline

Middleware, in order:

| Middleware                                                                    | Behavior                                                                                            |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `@hono/otel`                                                                  | Server span and request duration metric; `url.full` without the query string                       |
| CORS                                                                          | Exact origins from `CORS_ORIGINS`, credentials allowed                                              |
| [request-context](../apps/api/src/middlewares/request-context.ts)              | `x-request-id` (generated if absent), socket client address, `AsyncLocalStorage` scope              |
| [csrf](../apps/api/src/middlewares/csrf.ts)                                    | Unsafe methods: `Sec-Fetch-Site` / `Origin` must be same-origin or a trusted origin                 |
| [authenticate](../packages/identity/src/ports/http.ts)                         | Session cookie → principal; sliding refresh; clears invalid cookies; `Cache-Control: no-store`      |
| `timing`                                                                      | `Server-Timing` header                                                                              |

`authenticate` never rejects a request; procedures and handlers decide whether a principal is required.

## RPC procedures

Procedures are built with [`rpcQuery` / `rpcMutation`](../packages/common/src/rpc/procedure.ts):

| Meta                                   | Effect                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------- |
| (none)                                 | Requires a signed-in caller (401 otherwise)                             |
| `public: true`                         | No sign-in required                                                     |
| `permissions: { todo: ["complete"] }`  | Requires every listed permission (403 otherwise)                        |

`rpcQuery` is served on GET, `rpcMutation` on POST; `StrictGetMethodPlugin` rejects GET calls to mutations.

| Procedure            | Type     | Access            | Input                                         | Output                  |
| -------------------- | -------- | ----------------- | --------------------------------------------- | ----------------------- |
| `ping`               | query    | public            | —                                             | `"pong"`                |
| `auth.signUp`        | mutation | public            | `{ email, password }`                         | `{ user }` + cookie     |
| `auth.signIn`        | mutation | public            | `{ email, password }`                         | `{ user }` + cookie     |
| `auth.signOut`       | mutation | signed in         | —                                             | `{ ok: true }`          |
| `auth.signOutAll`    | mutation | signed in         | —                                             | `{ ok: true }`          |
| `auth.me`            | query    | public            | —                                             | `{ user, permissions }` or `null` |
| `user.list`          | query    | `user:list`       | `{ email?, limit? }`                          | `IUserDTO[]`            |
| `user.assignRole`    | mutation | `user:assignRole` | `{ userId, role }`                            | `IUserDTO`              |
| `todo.create`        | mutation | `todo:create`     | `{ title }`                                   | `ITodoDTO`              |
| `todo.complete`      | mutation | `todo:complete`   | `{ todoId }`                                  | `ITodoDTO`              |
| `todo.archive`       | mutation | `todo:archive`    | `{ todoId }`                                  | `ITodoDTO`              |
| `todo.list`          | query    | `todo:read`       | `{ status?, limit? }`                         | `ITodoDTO[]`            |

The session token is only ever sent in the `HttpOnly` cookie, never in a response body. The wire format is oRPC's
(`{ "json": … }` envelope). Errors: see [errors.md](errors.md#http-and-rpc).

DTOs: [`ITodoDTO`](../packages/todo/src/app/todo.dto.ts) (`id`, `title`, `status`, `completedAt`,
`completionNotifiedAt`, `createdAt`, `updatedAt`), [`IUserDTO`](../packages/identity/src/app/user.dto.ts)
(`id`, `email`, `role`, `createdAt`).

## REST: `GET /todos`

A hand-written adapter for the same `ListTodosQuery` as `todo.list`.

| Parameter | Type                                | Default |
| --------- | ----------------------------------- | ------- |
| `status`  | `open` \| `completed` \| `archived` | any     |
| `limit`   | integer 1–100                       | 50      |

| Response                                 | When                                    |
| ---------------------------------------- | --------------------------------------- |
| 200 `{ "todos": [ITodoDTO, …] }`         | Success                                 |
| 401 `{ "_tag": "UnauthorizedException" }` | No valid session                        |
| 403 `{ "_tag": "ForbiddenException" }`    | Role lacks `todo:read`                  |
| 400 `{ "_tag": "InvalidInput" }`          | `status` or `limit` fails the schema    |

Hono routes do not run oRPC middleware, so the handler calls `authorize({ todo: ["read"] })` from
[`@app/common/auth`](../packages/common/src/auth/authorization.ts) itself. Any non-RPC route must do the same.

## Calling the API with curl

Create an account in the web UI first. The cookie jar holds a session secret.

```sh
read -rs -p 'Password: ' PASSWORD; echo; export PASSWORD
umask 077
node -e 'console.log(JSON.stringify({json:{email:process.argv[1],password:process.env.PASSWORD}}))' you@example.com |
  curl -c /tmp/app-cookies -X POST localhost:3001/rpc/auth/signIn -H 'content-type: application/json' --data-binary @-
unset PASSWORD

curl -b /tmp/app-cookies -X POST localhost:3001/rpc/todo/create -H 'content-type: application/json' -d '{"json":{"title":"hello"}}'
curl -b /tmp/app-cookies -X POST localhost:3001/rpc/todo/complete -H 'content-type: application/json' -d '{"json":{"todoId":"<id>"}}'
curl -b /tmp/app-cookies localhost:3001/rpc/todo/list
curl -b /tmp/app-cookies 'localhost:3001/todos?status=open&limit=10'
rm /tmp/app-cookies
```

`completionNotifiedAt` is set asynchronously by the outbox worker after `todo.complete`.

## Web client

[apps/web](../apps/web): Next.js App Router, React, TanStack Query, Tailwind v4.

| File                                          | Contents                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [orpc.ts](../apps/web/app/orpc.ts)             | `createRPCClient()` from `@app/api-contract/client`; TanStack Query utilities (`orpc.todo.*`) |
| [account.tsx](../apps/web/app/account.tsx)     | Sign-up, sign-in, sign-out (one or all devices); clears private query caches on account change |
| [todos.tsx](../apps/web/app/todos.tsx)         | Todo list and mutations; polls while a completion notification is pending                   |
| [users.tsx](../apps/web/app/users.tsx)         | Admin role assignment                                                                        |

- The client is typed by `AppRouter`; changing a procedure's input or output is a compile error in the web app.
  The browser bundle contains only the client and `@app/common/env/client`, never server code.
- Requests use `credentials: "include"`; the browser owns the `HttpOnly` cookie.
- `NEXT_PUBLIC_RPC_URL` is read by the running web server and injected before hydration, so one image works in every
  environment.
- The UI hides controls based on `auth.me` permissions; server-side RBAC is authoritative.

## CLI

[apps/cli](../apps/cli) (`pnpm cli …`, or `node dist/cli.js` in the API image):

| Command                                                      | Description                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `db migrate`                                                 | Apply pending migrations                                            |
| `user role <email> <admin\|member\|viewer>`                  | Assign a role through `AssignRoleCommand`; never creates an account |
| `storage put <file> <key> [--content-type]`                  | Upload a file                                                       |
| `storage get <key> <file>`                                   | Download to a new file (never overwrites)                           |
| `storage head <key>` / `storage delete <key>`                | Inspect / delete (idempotent)                                       |
| `storage sign <key> --method GET\|PUT --expires-in <s>`      | Signed URL (minio driver only)                                      |

Every command accepts `--json`. The CLI registers DI on first use only: `db migrate` and `storage` commands do not
connect to Redis, and storage commands do not connect to Postgres. Running the CLI implies operator trust; it does
not pass through RPC authorization.
