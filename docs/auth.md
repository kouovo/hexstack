# Authentication and authorization

Implemented by the [identity context](bounded-contexts.md#identity), following
[Pilcrow's Auth Book](https://auth.pilcrowonpaper.com/) ([passwords](https://auth.pilcrowonpaper.com/passwords),
[sessions](https://auth.pilcrowonpaper.com/sessions), [CSRF](https://auth.pilcrowonpaper.com/csrf)). The RBAC model is
this template's own.

- [Accounts](#accounts)
- [Passwords](#passwords)
- [Sessions](#sessions)
- [Authorization](#authorization)
- [Rate limiting](#rate-limiting)
- [Deployment requirements](#deployment-requirements)
- [Not included](#not-included)

## Accounts

- Emails are trimmed and lowercased; a unique index on `app_user.email` rejects duplicates, including concurrent
  sign-ups (409 `EmailAlreadyRegisteredError`).
- Sign-up always creates a `member`. Roles supplied by clients are ignored.
- The user row and its first session are inserted in one transaction.
- Account existence is visible: duplicate sign-up is 409, unknown email on sign-in is 404 (`AccountNotFoundError`),
  wrong password is 401 (`IncorrectPasswordError`). Change these responses if enumeration privacy is required.

## Passwords

| Property            | Value                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Policy              | 8–100 printable ASCII characters, no leading/trailing space, no composition rules ([`Password`](../packages/identity/src/domain/user/password.value-object.ts)) |
| Hash                | Argon2id via native `node:crypto.argon2`: 16 MiB, 3 passes, parallelism 1, 16-byte salt, 32-byte tag   |
| Format              | PHC string; parameters are read back on verify; tags compared in constant time                        |
| Type boundary       | `PasswordHasher.hash(Password): Promise<PasswordHash>`; a new password cannot be hashed without passing the policy |
| Sign-in             | Verifies a bounded candidate string without re-applying the new-password policy                       |
| Representation      | `Password` and `PasswordHash` redact `toString()` / `toJSON()`                                         |

Hashing runs on the libuv thread pool. Benchmark the parameters and pool size for the deployment hardware; raise the
verifier's resource caps in [argon2-password-hasher.ts](../packages/identity/src/adapters/argon2-password-hasher.ts)
together with the parameters.

## Sessions

| Property        | Value                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| Token           | `<random id>.<random 256-bit secret>`, new on every sign-in ([session-token.ts](../packages/identity/src/app/session-token.ts)) |
| Storage         | `app_session` holds the id and SHA-256(secret); the secret itself is never stored                            |
| Lifetime        | 30 days, sliding; the expiry is extended at most once per hour, and the cookie with it                      |
| Cookie          | `__Host-app_session`, `Path=/`, `HttpOnly`, `SameSite=Lax`, no `Domain`; `app_session` when `SESSION_COOKIE_SECURE=false` |
| Role            | Read from `app_user` on every request, so role changes apply immediately                                    |
| Sign-out        | Deletes the current session; sign-out-all deletes every session of the user                                 |
| Expiry          | Expired sessions are rejected and deleted on use; an hourly job deletes the rest ([jobs.ts](../packages/identity/src/ports/jobs.ts)) |
| Account deletion| Cascades to sessions                                                                                         |

A cookie set by sign-in or sign-out in the same response takes precedence over a pending sliding refresh.
Identity-dependent responses carry `Cache-Control: no-store`.

Code: [SessionService](../packages/identity/src/app/session.service.ts),
[session-cookie.ts](../packages/identity/src/ports/session-cookie.ts), [authenticate()](../packages/identity/src/ports/http.ts).

## Authorization

Permissions are `resource → actions`. The catalog and the role table are in
[identity's permissions.ts](../packages/identity/src/domain/rbac/permissions.ts), the only place that grants
permissions:

| Role                 | `todo`                          | `user`             |
| -------------------- | ------------------------------- | ------------------ |
| `admin`              | create, read, complete, archive | list, assignRole   |
| `member` (default)   | create, read, complete          | —                  |
| `viewer`             | read                            | —                  |

Checking is context-independent ([`@app/common/auth`](../packages/common/src/auth/authorization.ts)):

| Function / port                 | Behavior                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `currentPrincipal()`            | The request's principal; throws `UnauthorizedException` (401) when anonymous             |
| `authorize(required?)`          | `currentPrincipal()` plus the permission check; throws `ForbiddenException` (403)        |
| `AuthorizationPolicy` port      | `roleHasPermissions(role, required)`; implemented by identity's `RoleAuthorizationPolicy` |

- RPC procedures call `authorize(meta.permissions)` unless `public: true` ([procedure.ts](../packages/common/src/rpc/procedure.ts)).
  Public procedures: `ping`, `auth.signUp`, `auth.signIn`, `auth.me`.
- Every listed permission is required. Unknown roles have no permissions.
- A contract test ([router.test.ts](../packages/api-contract/src/router.test.ts)) fails if a procedure requires a
  permission that the catalog does not declare.
- `user.list` and `user.assignRole` are admin-only. An admin may demote any admin, including the last one; recover with
  `pnpm cli user role <email> admin`.
- Todos are shared by all accounts. RBAC is not ownership or tenant isolation; add those to the use cases and
  repositories that need them.
- Role changes are logged by a best-effort in-process handler. That is not a durable security audit trail.

## Rate limiting

[Redis token buckets](../packages/identity/src/adapters/redis-rate-limiter.ts), atomic across replicas:

| Policy  | Key                         | Capacity | Refill           |
| ------- | --------------------------- | -------- | ---------------- |
| Sign-in | Normalized email            | 5        | 1 token / minute |
| Sign-up | Socket client address       | 10       | 1 token / minute |

Limited requests get 429 `RateLimitedError` with `metadata.retryAfterSeconds`. If Redis is unavailable, sign-in and
sign-up fail closed (503 `RateLimiterUnavailableError`). There is no permanent lockout. These buckets are not a
denial-of-service defense; add an edge limit.

## Deployment requirements

- Serve over HTTPS with `SESSION_COOKIE_SECURE=true` (the code default). `.env.example` sets `false` for plain-HTTP
  local development only.
- Web and API must be same-site (for example `app.example.com` and `api.example.com`). `SameSite=Lax` cookies are not
  sent cross-site, whatever CORS allows.
- Set `CORS_ORIGINS` to the exact web origins. It is empty by default; never use wildcard credentialed CORS.
- Unsafe requests must pass the [CSRF check](../apps/api/src/middlewares/csrf.ts): `Sec-Fetch-Site: same-origin`, or an
  `Origin` equal to the API origin or a trusted origin. Requests without either signal (non-browser clients) are allowed.
  Business mutations are never GET.
- Behind a reverse proxy the socket address is the proxy's, so every user shares one sign-up bucket. Derive the client
  address from the proxy's trusted header in [request-context.ts](../apps/api/src/middlewares/request-context.ts);
  never trust `X-Forwarded-For` from the internet.
- `HttpOnly` keeps scripts from reading the cookie, not from using it. Review CSP and dependencies for XSS.

## Not included

Password reset, email verification, breached-password screening, MFA, OAuth and passkeys, ownership and tenant
policies, durable security auditing.
