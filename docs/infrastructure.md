# Infrastructure

Shared infrastructure lives in [`@app/common`](../packages/common). Contexts depend on the ports; the adapters are
registered by [`registerInfrastructure()`](../packages/common/src/bootstrap/register.ts).

| Port                                                                              | Token                  | Adapter                                                                                              |
| --------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| [`ApplicationTransactionPort`](../packages/common/src/cqrs/transaction.port.ts)   | `APPLICATION_TRANSACTION_PORT` | [`ApplicationTransactionAdapter`](../packages/common/src/db/application-transaction-adapter.ts) |
| [`CachePort`](../packages/common/src/cache/cache.port.ts)                         | `CACHE`                | [`KeyvCacheAdapter`](../packages/common/src/cache/redis/keyv-cache.adapter.ts)                         |
| [`LockPort`](../packages/common/src/lock/lock.port.ts)                            | `LOCK`                 | [`RedisLockAdapter`](../packages/common/src/lock/redis/lock.adapter.ts)                                |
| [`JobDispatcher`](../packages/common/src/queue/queue.port.ts)                     | `JOB_DISPATCHER`       | [`BullMQJobDispatcher`](../packages/common/src/queue/bullmq/bullmq-job-dispatcher.adapter.ts)          |
| [`ObjectStoragePort`](../packages/common/src/storage/object-storage.port.ts)      | `OBJECT_STORAGE_PORT`  | [Local / MinIO](../packages/common/src/storage/adapters)                                               |
| [`DomainEventPipeline`](../packages/common/src/events/pipeline.port.ts)           | `DOMAIN_EVENT_PIPELINE`| [`MillstreamDomainEventPipeline`](../packages/common/src/events/millstream/domain-event-pipeline.ts)   |

- [Cache](#cache)
- [Locks](#locks)
- [Object storage](#object-storage)
- [Queues and scheduled jobs](#queues-and-scheduled-jobs)
- [Observability](#observability)

## Cache

| Method                                                 | Behavior                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `get(key, options?)` / `set(key, value, ttl?)` / `delete(key)` | Entry access; `get` hides negative entries                                             |
| `getOrSet(key, loader, ttl?, options?)`                | Read-through for one entry; invalidate with `delete`                                           |
| `getOrSetVersioned(namespace, loader, ttl?, options?)` | Read-through under the namespace's current version; `options.queryKey` separates inputs       |
| `bumpVersion(namespace)`                               | Makes every entry of the namespace unreachable at once                                         |

Options: `queryKey`, `lock` (single-flight the loader), `emptyTtlSeconds` (negative-entry TTL, `0` disables),
`statsType` (metrics label). TTLs are seconds. Helpers: `jitteredTtlSeconds()` (± 10 %), `stableStringify()`.

Example: [`ListTodosQueryHandler`](../packages/todo/src/app/query/list-todos.query.ts) caches under `todos:list` with
a key from [`todoListQueryKey()`](../packages/todo/src/app/todo-list-cache-key.ts);
[`TodoListCacheInvalidationHandler`](../packages/todo/src/app/event/todo-list-cache-invalidation.handler.ts), subscribed
in process to the three todo events, bumps the namespace after commit.

| Topic              | Behavior                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| What to cache      | JSON-compatible DTOs only; never entities, hashes, sessions or authorization decisions. Scoped reads put the scope in the namespace or key, after authorization |
| Versions           | One Redis counter per namespace (`<CACHE_NAMESPACE>:cver:<namespace>`); value keys embed the version. A load that started before a bump writes under the old version and is never read. Old entries expire by TTL |
| Negative entries   | A loader returning `undefined` or throwing `NotFoundException` is cached for `emptyTtlSeconds` (default 30) and replayed as `NotFoundException`. Other errors are not cached |
| Stampedes          | With `lock: true`, one replica takes a 5 s per-key lease (`LockPort.tryAcquire`), re-checks the cache and loads; the others poll the cache (10→100 ms, jittered) and return the fill. A load that outlives its lease returns its value without writing it. A lock-store error loads at once without single-flight; waiting longer than 2 s loads too |
| Failures           | Fail open: read errors are misses, write errors are logged, an unreadable version skips the cache for that call                              |
| Connection         | Own Redis connection ([cache-redis-client.ts](../packages/common/src/cache/redis/cache-redis-client.ts)), 250 ms command timeout; commands queue only until the first connection, then fail fast |
| Invalidation       | Best effort: process death or a Redis failure can leave an entry until its TTL. Writes that publish no event invalidate directly           |
| Redis requirement  | `maxmemory-policy noeviction` (also required by BullMQ); an evicted version counter restarts at 0                                             |

Configuration: `CACHE_DRIVER` (`redis` shared by replicas, or `memory` for a single process) and `CACHE_NAMESPACE`
(prefix of every cache, version and lock key; distinct per application and environment).

## Locks

`LockPort` is a general-purpose distributed lock on the shared Redis client
([lock.adapter.ts](../packages/common/src/lock/redis/lock.adapter.ts)): single node, `SET key token NX PX ttl`,
release and extension in Lua that only touch the caller's own token.

| Method                        | Behavior                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `using(resource, ttlMs, fn)`  | Retries with jittered exponential backoff (50→500 ms) for up to 2 s, then `LockContentionError` (423, retryable). Extends the lease every `ttl / 3` while `fn` runs; a lost lease aborts `signal` (`assertLockHeld`) |
| `tryAcquire(resource, ttlMs)` | One attempt, no wait, no extension: a `LockLease` or `undefined`. `release()` never throws                     |

Redis errors propagate at once and are never retried as contention. A lock coordinates; it is not a correctness
guarantee: keep database constraints authoritative.

## Object storage

| Method                                                     | Behavior                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `putObject({ key, body, contentType?, metadata? })`        | Upload a string, bytes, `ArrayBuffer`, `Blob` or web `ReadableStream` |
| `getObject({ key })`                                       | Metadata and a `Blob` or web stream; consume or cancel it            |
| `headObject({ key })`                                      | Size, content type, metadata, last modified                          |
| `deleteObject({ key })`                                    | Idempotent                                                           |
| `createSignedObjectUrl({ key, method, expiresInSeconds })` | GET or PUT URL, 1–3600 s; `minio` driver only                        |

Missing objects raise `NotFoundException`; permission, bucket, network and provider failures are errors, not misses.

| Driver  | Configuration                                                                                                 | Notes                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `local` (default) | `STORAGE_BUCKET`, `STORAGE_LOCAL_ROOT` (relative to the process cwd; use an absolute path to share it) | Hashed file names with metadata sidecars under the bucket; temporary writes protect existing objects. Development only; signing throws `NotImplementException` |
| `minio` | `STORAGE_MINIO_ENDPOINT`, `STORAGE_MINIO_ACCESS_KEY`, `STORAGE_MINIO_SECRET_KEY`, `STORAGE_MINIO_REGION`, `STORAGE_MINIO_USE_SSL` | MinIO or a private S3-compatible endpoint. HTTPS endpoints require `USE_SSL=true`. The endpoint must be reachable by whoever uses signed URLs |

Local MinIO: `pnpm infra:storage` starts MinIO, creates `STORAGE_BUCKET` and disables anonymous access; then set
`STORAGE_DRIVER=minio`. Console: http://localhost:9001. Data lives in the `minio-data` volume. The application never
creates production buckets or makes a bucket public. Credentials are required only when the `minio` driver is first
resolved.

Constraints:

- Keys are relative ASCII paths (`A-Z a-z 0-9 . _ - /`), at most 1024 characters, with no empty, `.` or `..` segments.
  Metadata keys are lowercase and header-safe, values printable ASCII, 8 KiB in total.
- There is no file route or file UI. A use case that issues downloads or uploads must authorize the key, enforce
  quotas and types, and decide whether to issue a URL.
- Signed URLs are bearer credentials: never log them. GET URLs force an attachment download. Signing does not check
  existence and URLs are not single-use.
- A signed PUT does not enforce content type or size and allows replacing the key until expiry. Use unique keys and
  validate uploads in a finalize step. Configure bucket CORS for browser uploads.
- Object writes are not part of the SQL transaction. Model a pending/finalized lifecycle and a cleanup policy.

## Queues and scheduled jobs

[`BullMQJobDispatcher`](../packages/common/src/queue/bullmq/bullmq-job-dispatcher.adapter.ts) implements `JobDispatcher`:
`enqueue`, `registerJob`, `scheduleRepeat`, `unscheduleRepeat`. With `enableWorkers: false` (the CLI) jobs can be
enqueued but no worker starts. Completed jobs are kept up to 1,000, failed jobs up to 5,000.

At API startup ([index.ts](../apps/api/src/index.ts), [maintenance.ts](../apps/api/src/maintenance.ts)):

| Job                                   | Schedule        | Owner                                                 |
| ------------------------------------- | --------------- | ----------------------------------------------------- |
| Outbox relay                          | continuous      | `common` (`DOMAIN_EVENT_PIPELINE`), every replica     |
| One worker per outbox subscription    | on demand       | `common` (`registerJobs`)                              |
| `session-cleanup-tick`                | hourly, cluster-wide | identity ([jobs.ts](../packages/identity/src/ports/jobs.ts)) |
| Retired `outbox-relay-tick`, `outbox-cleanup-tick` | removed at startup | apps/api                            |

`SIGTERM` / `SIGINT` stop the HTTP server, close the relay (in-flight deliveries finish or return to their queue),
flush telemetry and exit.

## Observability

[telemetry.ts](../apps/api/src/telemetry.ts) starts the OpenTelemetry Node SDK (traces, metrics, logs over OTLP/HTTP)
before any other module. It is off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set; everything else uses the standard
`OTEL_*` variables.

| Signal source | Instrumentation                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP          | `@hono/otel`: server span per request, `http.server.request.duration`; `url.full` without query string                                               |
| SQL           | [db.telemetry.ts](../packages/common/src/db/db.telemetry.ts): CLIENT span per query under an existing span, parameterized `db.query.text` only, `db.client.operation.duration` |
| Domain events | `@millstream/otel`: outbox write and relay spans; the trace context travels in message metadata, from the request through the outbox to every job   |
| Jobs          | `bullmq-otel`: producer span on enqueue, continued by the worker's processing span                                                                   |
| Cache         | [cache.telemetry.ts](../packages/common/src/cache/redis/cache.telemetry.ts): `cache.get_or_set <statsType>` span, `app.cache.requests` by type and outcome (`hit`, `empty`, `miss`, `coalesced`, `bypass`); keys are never recorded |
| Logs          | pino lines carry `trace_id` / `span_id`; with the SDK on, [the logger](../packages/common/src/logger/index.ts) also emits each line as an OTel LogRecord |
| Runtime       | `@opentelemetry/instrumentation-runtime-node`, process CPU and RSS                                                                                   |

Instrumentation scopes: `@app/common/db`, `@app/common/cache`, `@app/common/queue`, `@app/common/logger`.

Local backend: `pnpm infra:otel`, set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`, open Grafana at
http://localhost:3300. **Dashboards → App** provides *API overview* and *Node.js runtime*, provisioned read-only from
[deployment/docker/grafana/dashboards](../deployment/docker/grafana/dashboards) (reloaded within 10 s of a change).
Metrics export every 60 s by default; `OTEL_METRIC_EXPORT_INTERVAL=5000` shortens it locally.
