# Testing

```sh
pnpm test          # Vitest in every package and app
pnpm check-types
pnpm lint
pnpm format:check
pnpm build
```

The default suite needs neither Docker nor network services. [CI](../.github/workflows/ci.yml) runs the commands
above with a frozen lockfile and then applies the migrations to a fresh Postgres service.

## Test layers

| Layer          | Exercises                                                                     | Doubles                                     | Examples                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain         | Value objects, transitions, specifications, role permissions                  | none                                        | [todo.entity.test.ts](../packages/todo/src/domain/todo/todo.entity.test.ts), [permissions.test.ts](../packages/identity/src/domain/rbac/permissions.test.ts) |
| Application    | Use cases, event handlers, cache behavior                                     | in-memory repositories, transaction, cache  | [todo.test.ts](../packages/todo/src/app/todo.test.ts), [auth.test.ts](../packages/identity/src/app/auth.test.ts)                                     |
| Adapters       | SQL repositories, constraints, rollback, conditional updates, outbox writes   | PGlite with the production migrations       | [todo.repository.test.ts](../packages/todo/src/adapters/todo.repository.test.ts), [user.repository.test.ts](../packages/identity/src/adapters/user.repository.test.ts) |
| Ports          | Public error projections                                                      | none                                        | [todo](../packages/todo/src/ports/public-errors.test.ts), [identity](../packages/identity/src/ports/public-errors.test.ts)                           |
| Contract       | Every procedure: authentication, RBAC, error mapping; permission catalog      | `registerApplication()` with fakes          | [router.test.ts](../packages/api-contract/src/router.test.ts)                                                                                      |
| HTTP           | Middleware, cookies, CSRF, REST route, sign-up/sign-in flows                  | `registerApplication()` with fakes          | [app.test.ts](../apps/api/src/app.test.ts)                                                                                                          |
| CLI            | Operator commands                                                             | stubbed service resolver                    | [user.test.ts](../apps/cli/src/commands/user.test.ts)                                                                                               |
| Infrastructure | Event bus, outbox relay and workers, cache adapter, locks, telemetry          | in-memory Keyv, `MemoryPubSub`              | [packages/common](../packages/common/src)                                                                                                           |

## Wiring tests

Tests above the application layer register fakes for the outbound ports, then the application layer of the real
contexts:

```ts
container.register(TODO_REPO, { useValue: todoRepo });
container.register(USER_REPO, { useValue: userRepo });
// … SESSION_REPO, PASSWORD_HASHER, RATE_LIMITER, DOMAIN_EVENT_OUTBOX, APPLICATION_TRANSACTION_PORT, CACHE
registerApplication([identityContext, todoContext]);
```

`registerApplication()` does not call `registerAdapters()`, so no database or Redis client is created.

Use-case tests construct handlers directly, with
[`FakeApplicationTransaction`](../packages/common/src/cqrs/testing/index.ts) (`@app/common/cqrs/testing`): it has
the real nesting and commit-hook semantics and records `"commit"` / `"rollback"` in its `log`. In-memory repositories
call `DomainEventTracker.track` like the SQL ones. The tracker takes the set of durable event names as its fourth
argument; pass `outboxEventNames(TODO_SUBSCRIPTIONS)` to reproduce production behavior, or `new Set()` when the test
does not involve the outbox. Fixtures persisted outside a transaction must have no pending events
(`clearDomainEvents()`), or be written inside `run`.

## Test database

[`createTestDatabase()`](../packages/common/src/db/testing/test-database.ts) starts an in-memory PGlite instance and
applies [apps/api/drizzle/postgres](../apps/api/drizzle/postgres), the same migrations production runs. It returns the
query builder and a `TransactionManager`. PGlite is single-connection, so concurrent transactions cannot be tested;
conditional updates are tested sequentially.

## Not covered by the suite

Real Postgres concurrency, Redis Lua scripts, BullMQ, MinIO, and browser cookie behavior. Verify them in an integration
or staging environment. There is no browser end-to-end suite.

## Conventions

- Test business behavior: lifecycles, accounts, sessions, permissions, failure mapping.
- Do not add tests for DI registration or configuration.
- Prefer the lightest double that still proves the boundary under test.
