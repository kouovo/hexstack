# Configuration

- [Environment variables](#environment-variables)
- [Renaming the template](#renaming-the-template)

## Environment variables

Server variables are validated at startup by [env/schema.ts](../packages/common/src/env/schema.ts). Local values are
in [.env.example](../.env.example); the apps load `.env` from the repository root.

### Server

| Variable                        | Default        | Description                                                                                 |
| ------------------------------- | -------------- | ------------------------------------------------------------------------------------------- |
| `NODE_ENV`                      | `development`  | `development`, `test` or `production`                                                       |
| `PORT`                          | `3001`         | API port                                                                                    |
| `LOG_LEVEL`                     | `info`         | pino level                                                                                  |
| `POSTGRES_URL`                  | —              | Application connection; may point at a transaction-mode pooler. Required by the API         |
| `POSTGRES_DIRECT_URL`           | `POSTGRES_URL` | Direct connection for migrations and drizzle-kit                                           |
| `POSTGRES_PREPARE`              | `true`         | Named prepared statements; `false` behind poolers that cannot track them                   |
| `DB_STATEMENT_TIMEOUT_MS`       | `0`            | `statement_timeout` for application transactions; `0` disables                             |
| `DB_HEAVY_STATEMENT_TIMEOUT_MS` | `120000`       | `statement_timeout` for transactions run with `heavy: true`                                 |
| `REDIS_URL`                     | —              | Redis for cache, locks, rate limiting and BullMQ                                            |
| `CORS_ORIGINS`                  | empty          | Comma-separated exact browser origins trusted by CORS and CSRF                              |
| `SESSION_COOKIE_SECURE`         | `true`         | `false` only for plain-HTTP local development                                               |
| `CACHE_DRIVER`                  | `redis`        | `redis` or `memory` (single process)                                                        |
| `CACHE_NAMESPACE`               | `app:cache`    | Prefix of cache, version and lock keys                                                      |
| `STORAGE_DRIVER`                | `local`        | `local` or `minio`                                                                          |
| `STORAGE_BUCKET`                | `app`          | Bucket name (S3 naming rules)                                                               |
| `STORAGE_LOCAL_ROOT`            | `.app-storage` | Root directory of the local driver                                                          |
| `STORAGE_MINIO_ENDPOINT`        | `http://localhost:9000` | MinIO / S3-compatible endpoint                                                     |
| `STORAGE_MINIO_ACCESS_KEY`      | —              | Required by the `minio` driver                                                              |
| `STORAGE_MINIO_SECRET_KEY`      | —              | Required by the `minio` driver                                                              |
| `STORAGE_MINIO_REGION`          | `us-east-1`    |                                                                                             |
| `STORAGE_MINIO_USE_SSL`         | `false`        | Must match the endpoint scheme                                                              |
| `OUTBOX_POLL_INTERVAL_MS`       | `1000`         | Relay poll interval when the outbox is empty                                                |
| `DOMAIN_EVENT_JOB_ATTEMPTS`     | `10`           | Attempts per outbox job                                                                     |
| `DOMAIN_EVENT_JOB_BACKOFF_MS`   | `1000`         | Base of the exponential backoff between attempts                                            |
| `APP_MIGRATIONS_DIR`            | —              | CLI only: directory containing `postgres/`                                                  |
| `OTEL_EXPORTER_OTLP_ENDPOINT`   | —              | Enables OpenTelemetry; other standard `OTEL_*` variables apply                              |

### Web

| Variable              | Default                     | Description                                                                                 |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_RPC_URL` | `http://localhost:3001/rpc` | Browser-facing RPC URL; read at runtime by the web server and injected into the page. Must not contain credentials |

## Renaming the template

### Table prefix

Change `TABLE_PREFIX` in [table-prefix.ts](../packages/common/src/db/schema/table-prefix.ts). It drives Drizzle table
names, Kysely table types, raw SQL constants and the drizzle-kit filter. For a project that has never been deployed,
regenerate the migrations:

```sh
rm -rf apps/api/drizzle/postgres
pnpm db:generate --name init
```

The hand-written outbox DDL in `0003_millstream_outbox.sql` must be carried over into the new history. For an existing
database write a forward migration; never delete applied migrations.

### Package scope

The `@app/` scope appears in imports and manifests:

```sh
rg -l '@app/' apps packages package.json --glob '!node_modules/**' --glob '!dist/**' --glob '!.next/**' |
  xargs sed -i 's#@app/#@yourscope/#g'
pnpm install
```

This also renames the OpenTelemetry instrumentation scopes (`@app/common/*`), which dashboards may filter on.

### Names

Root `package.json` name, the [CLI binary name](../apps/cli/src/create-cli.ts), [web metadata](../apps/web/app/layout.tsx),
the session cookie name in [session-cookie.ts](../packages/identity/src/ports/session-cookie.ts), and database and
container names in [compose.yaml](../deployment/docker/compose.yaml).
