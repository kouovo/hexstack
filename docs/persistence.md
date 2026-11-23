# Persistence

- [Overview](#overview)
- [Schemas and table types](#schemas-and-table-types)
- [Repositories](#repositories)
- [Specifications](#specifications)
- [Mappers and records](#mappers-and-records)
- [Migrations](#migrations)
- [Connection poolers](#connection-poolers)

## Overview

| Concern                  | Tool / location                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| Runtime database         | Postgres (PGlite is used only by tests)                                                          |
| Table definitions        | Drizzle, one `src/adapters/*.schema.ts` per context                                              |
| Queries                  | Kysely, through the ambient [`TransactionManager`](../packages/common/src/db/transaction.ts)      |
| Migrations               | drizzle-kit, generated into [apps/api/drizzle/postgres](../apps/api/drizzle/postgres), applied by the CLI |
| Outbox table             | `millstream_queue_outbox`, owned by millstream, created by a hand-written migration              |

All contexts share one database and one migration history. Each context defines and queries only its own tables.

## Schemas and table types

Tables are defined with the helpers in [`@app/common/db/schema`](../packages/common/src/db/schema), which apply the
table prefix:

```ts
// packages/todo/src/adapters/todo.schema.ts
export const todo = pgTable("todo", { id: text("id").primaryKey(), createdAt: timestamp("created_at").defaultNow().notNull() /* … */ });

// packages/todo/src/adapters/todo.database.ts
export type TodoDatabase = KyselyTables<{ todo: typeof todo }>;
export const TODO_TABLE = tableName("todo"); // "app_todo"
```

| Helper              | Purpose                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `pgTable`           | Drizzle table creator that prefixes names with `TABLE_PREFIX`                               |
| `timestamp(name)`   | `timestamptz` column read as `Date`                                                         |
| `KyselyTables<T>`   | Maps unprefixed name → Drizzle table to the prefixed Kysely table map                       |
| `tableName(name)`   | Prefixed table name, typed as a literal                                                     |
| `TABLE_PREFIX`      | `app_`; see [table-prefix.ts](../packages/common/src/db/schema/table-prefix.ts)               |
| `TABLES_FILTER`     | `app_*`; the only tables drizzle-kit manages                                                |

| Table         | Owner                                                            |
| ------------- | ---------------------------------------------------------------- |
| `app_todo`    | [todo](../packages/todo/src/adapters/todo.schema.ts)              |
| `app_user`    | [identity](../packages/identity/src/adapters/identity.schema.ts)  |
| `app_session` | [identity](../packages/identity/src/adapters/identity.schema.ts)  |

A foreign key may only reference a table of the same context (`app_session.user_id` → `app_user.id`).

## Repositories

A repository file (`adapters/<aggregate>.repository.ts`) contains the interface handlers depend on, the stored record
type, the DI token and the implementation. The implementation gets its executor from the transaction manager, typed
with the context's own table map:

```ts
@singleton()
export class TodoRepository implements ITodoRepository {
  constructor(@injectTransactionManager() private readonly transactions: ITransactionManager) {}

  async insert(todo: TodoEntity): Promise<void> {
    await this.transactions.getExecutor<TodoDatabase>().insertInto(TODO_TABLE).values(toTodoRecord(todo)).execute();
  }
}
```

`getExecutor()` returns the current transaction when called inside `DomainEventScope.run` /
`ApplicationTransactionPort.run`, and the pool otherwise. The query builder itself is untyped (`Kysely<any>`); the
type parameter is what restricts a context to its tables.

Shared helpers in [`@app/common/db`](../packages/common/src/db): `QueryVisitor` (specification → SQL),
`toPersistenceDate` / `fromPersistenceDate`, `toPersistenceJson`.

## Specifications

Specifications express which entities match, without SQL in the domain. They are evaluated in memory with
`spec.isSatisfiedBy(entity)` (used by test fakes) and in SQL by a `QueryVisitor` subclass
([`TodoQueryVisitor`](../packages/todo/src/adapters/todo.query-visitor.ts)).

```ts
const spec = new TodoIdSpecification(id).and(new TodoStatusSpecification(TodoStatus.open()));
await repo.findOne(spec);
await repo.find(spec, { limit: 50 });
```

| Rule                                                                                                            |
| --------------------------------------------------------------------------------------------------------------- |
| Specifications compose with `.and()`, `.or()`, `.not()`                                                         |
| `specificationBuilder()` ANDs optional filters and skips undefined values                                      |
| Factories accept a specification: `TodoEntity.create(new TodoTitleSpecification(title))` writes its value      |
| Every specification has a visitor method and a SQL implementation                                               |
| Specifications never accept column names or SQL fragments                                                       |

## Mappers and records

Each aggregate has one mapper file in `app/` with pure functions:

| Function            | Direction                                                          |
| ------------------- | ------------------------------------------------------------------ |
| `toXEntity(record)` | Stored record → entity (`rehydrate`, timestamps normalized)         |
| `toXRecord(entity)` | Entity → stored record (database column names, `Date` values)      |
| `toXDTO(entity)`    | Entity → public DTO (whitelisted fields, ISO timestamps)            |

The record type (`TodoRecord`) is declared in the repository file. The Kysely row type must stay assignable to
it, which the repository's use of the mappers checks at compile time. Public DTOs never contain password hashes,
session secrets or tokens.

## Migrations

```sh
pnpm db:generate --name add_invoice   # drizzle-kit, config: apps/api/drizzle.config.ts
pnpm db:migrate                       # CLI: app db migrate
```

- drizzle-kit reads every `packages/*/src/adapters/*.schema.ts` and writes to `apps/api/drizzle/postgres`.
- The [migrator](../packages/common/src/db/migrate.ts) takes a session-level advisory lock, so concurrent runs
  serialize, and connects with `POSTGRES_DIRECT_URL` (default `POSTGRES_URL`).
- The API never migrates on boot. Run migrations as a deploy step before rolling out code that needs them.
- `APP_MIGRATIONS_DIR` overrides where the CLI looks for migrations; the API image ships them in `drizzle/postgres`.

| Migration                                                                                  | Notes                                                                                                                     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `0000_init`, `0001_auth`                                                                    | Tables and indexes                                                                                                        |
| [0002_outbox_bullmq_relay](../apps/api/drizzle/postgres/0002_outbox_bullmq_relay.sql)       | Replaces the lease/retry outbox columns. Stop old relay processes first; `pending`, `processing` and `dead` rows are republished |
| [0003_millstream_outbox](../apps/api/drizzle/postgres/0003_millstream_outbox.sql)           | Moves unpublished rows to `millstream_queue_outbox` and drops `app_outbox`. Stop old processes and drain the old `domain-event` queue first |

## Connection poolers

No pooler is bundled. Behind a transaction-mode pooler such as PgBouncer:

- set `POSTGRES_DIRECT_URL` to Postgres itself; migrations need session state;
- code that runs through the pooler uses `SET LOCAL` / `set_config(..., true)` inside transactions only (the statement
  timeout does), never session `SET`, session advisory locks, `LISTEN` or temporary tables; the outbox relay polls
  instead of using `LISTEN`;
- named prepared statements need PgBouncer ≥ 1.21 with `max_prepared_statements > 0`; otherwise set
  `POSTGRES_PREPARE=false`.
