# Errors

- [Error classes](#error-classes)
- [Where errors are defined](#where-errors-are-defined)
- [Public projection](#public-projection)
- [HTTP and RPC](#http-and-rpc)
- [Background jobs](#background-jobs)
- [Rules](#rules)

## Error classes

Every expected failure is a class extending [`DomainError`](../packages/common/src/ddd/domain-error.ts) and is
thrown with ordinary `throw`. There is no result type and no second error base.

| Member      | Meaning                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `_tag`      | Literal string; the error's identity on every boundary                                                   |
| `kind`      | Server-side category from `ErrorKind`; selects the HTTP status, never sent to clients                    |
| `retryable` | Whether a retried job can succeed (default `false`)                                                      |
| fields      | Typed, error-specific data such as `todoId`, `from`/`to`, `retryAfterSeconds`                            |
| `cause`     | The original error when an adapter translates a lower-level failure                                      |
| `toJSON()`  | `{ _tag, message }` only                                                                                 |

`ErrorKind` → HTTP status ([`HTTP_STATUS`](../packages/common/src/errors/public-error.ts)):

| Kind              | Status |
| ----------------- | ------ |
| `invalid-input`   | 400    |
| `unauthorized`    | 401    |
| `forbidden`       | 403    |
| `not-found`       | 404    |
| `conflict`        | 409    |
| `validation`      | 422    |
| `locked`          | 423    |
| `rate-limited`    | 429    |
| `not-implemented` | 501    |
| `unavailable`     | 503    |
| `internal`        | 500    |

A new error reuses an existing kind; the status table does not grow with the error catalog.

## Where errors are defined

| Errors                                                         | File                                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Common (`UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `LockContentionError`, …) | [common/errors/common.errors.ts](../packages/common/src/errors/common.errors.ts) |
| Object storage input errors                                    | [common/storage/storage.errors.ts](../packages/common/src/storage/storage.errors.ts)                 |
| Storage configuration faults (internal, never public)          | [common/storage/adapters/storage-configuration.errors.ts](../packages/common/src/storage/adapters/storage-configuration.errors.ts) |
| Todo                                                           | [todo/domain/todo/todo.errors.ts](../packages/todo/src/domain/todo/todo.errors.ts)                   |
| Users                                                          | [identity/domain/user/user.errors.ts](../packages/identity/src/domain/user/user.errors.ts)           |
| Sign-in / sign-up / sessions                                   | [identity/domain/auth.errors.ts](../packages/identity/src/domain/auth.errors.ts)                     |

Each file exports a union of its public errors (`TodoError`, `UserError`, `AuthError`, `CommonError`,
`StorageError`). Adapters translate only the failures they recognize (a unique-index violation on `app_user.email`
becomes `EmailAlreadyRegisteredError`) and keep the original as `cause`; anything else is rethrown unchanged.

## Public projection

A client sees an error only through an explicit projection. Each context contributes a
[`PublicErrorMap`](../packages/common/src/errors/public-error.ts) for its own union:

```ts
export const TODO_PUBLIC_ERRORS = {
  TodoNotFoundError: (error) => ({
    _tag: error._tag,
    message: "This todo no longer exists. Refresh the list.",
    metadata: { todoId: error.todoId },
  }),
  // …
} satisfies PublicErrorMap<TodoError>;
```

- `satisfies PublicErrorMap<Union>` makes the map exhaustive for the union at compile time.
- `registerApplication()` merges the common maps and every context's `publicErrors` into one
  [`PublicErrorCatalog`](../packages/common/src/errors/public-error-catalog.ts) (DI token `PUBLIC_ERROR_CATALOG`).
  A tag projected twice fails at startup.
- An error without a projection, a `DomainError` of an internal kind included, is treated as unknown.

Projection maps: [common](../packages/common/src/errors/common.public-errors.ts),
[storage](../packages/common/src/storage/storage.public-errors.ts), [todo](../packages/todo/src/ports/public-errors.ts),
[identity](../packages/identity/src/ports/public-errors.ts).

## HTTP and RPC

| Boundary | Handler                                                                  | Known error                                                                 | Unknown error                                     |
| -------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------- |
| oRPC     | [rpc/errors.ts](../packages/common/src/rpc/errors.ts) (procedure middleware) | `ORPCError` with `HTTP_STATUS[kind]`, `message`, `data: { _tag, metadata? }` | Logged; 500, `data: { _tag: "InternalError" }`   |
| Hono     | `onError` in [app.ts](../apps/api/src/app.ts)                             | `HTTP_STATUS[kind]`, body `{ _tag, message, metadata? }`                    | Logged; 500, `{ _tag: "InternalError" }`          |

Other Hono responses: an `HTTPException` below 500 becomes `{ _tag: "HttpError" }`; unmatched routes become
404 `{ _tag: "NotFoundException" }`. Routes and procedures return plain DTOs and never format errors themselves.

Clients branch on `_tag` (oRPC: `error.data._tag`), never on `message`. Developer messages, causes, stacks and
fields not selected by the projection stay on the server.

## Background jobs

The BullMQ worker ([bullmq-job-dispatcher.adapter.ts](../packages/common/src/queue/bullmq/bullmq-job-dispatcher.adapter.ts))
turns a `DomainError` with `retryable === false` into BullMQ's `UnrecoverableError` (no further attempts), keeping it
as `cause`. Retryable domain errors and all other exceptions are rethrown so the configured attempts and backoff apply.
Failures are logged by the worker's `failed` listener.

## Rules

- One class per business failure. Do not throw generic invalid-argument errors from the domain.
- Domain validation failures are `validation` (422); malformed storage input is `invalid-input` (400).
- Configuration faults and broken invariants are `internal` and have no projection.
- Catch a specific class only where handling it is part of the behavior (for example, treating "already done" as
  success in an idempotent handler).
- TypeScript does not check thrown unions at call sites. The projection maps are exhaustive; individual `catch`
  blocks are not.
