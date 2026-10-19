# Typed errors with throw

Business/application failures use native exceptions, not a return-value wrapper. Define one class per failure,
with a literal `_tag` and typed fields. The `DomainError` base is exported from `@app/core`; concrete errors are exported from `@app/domain`.

```ts
import { DomainError } from "@app/core";

export class ItemNotFound extends DomainError<"ItemNotFound"> {
  readonly _tag = "ItemNotFound";
  readonly kind = "not-found";
  constructor(readonly itemId: string) {
    super(`Item ${itemId} not found`);
  }
}

export class BackendUnavailable extends DomainError<"BackendUnavailable"> {
  readonly _tag = "BackendUnavailable";
  readonly kind = "unavailable";
  override readonly retryable = true;
  constructor(cause: unknown) {
    super("Backend unavailable", { cause });
  }
}

async function findItem(id: string): Promise<Item> {
  const item = await repository.find(id);
  if (!item) throw new ItemNotFound(id);
  return item;
}
```

## Adding a failure

1. Put **every concrete project error class and error union** in `packages/domain/src/errors`, grouped by concern, and export
   it through `packages/domain/src/errors/index.ts` (the `@app/domain` public entry point exports that index).
   Import the shared `DomainError` base from `@app/core` for business, adapter, configuration and CQRS failures.
   Only that abstract base lives in core; do not define or re-export concrete errors in application, core, CQRS or infrastructure packages. Keep HTTP codes/public wording in transport mappings.
2. Give each class a unique tag, an explicit `kind` from core's finite `ErrorKind` union, and useful typed fields.
   `kind` is transport-neutral and server-side only; `_tag` remains the public identity. `retryable` is a separate
   policy, not inferred from `kind`. Never put passwords/tokens in an error. Use native `cause` for wrapped failures;
   rethrow unrelated exceptions unchanged.
3. Add public failures to the relevant exported boundary catalog (`TodoError`, `AuthError`, `UserError`, `StorageError`) and, for a new boundary,
   to `KnownError` in `packages/domain/src/errors/index.ts`.
4. Add its safe public projection to the relevant module in `packages/rpc/src/error-projections`.
   `PublicErrorMap` requires every cataloged tag, gives each projector its own typed fields, and preserves its tag.
   The shared `HTTP_STATUS` table in `packages/rpc/src/domain-errors.ts` maps `ErrorKind`, not individual tags:
   adding a concrete failure does not change it. A genuinely new kind requires a status mapping at compile time.
5. Test rollback/no events, HTTP/RPC status and tag, safe serialization, and retry policy when applicable.

Catalogs document boundary failures; TypeScript cannot check which errors a function throws or require callers to
catch them. The exhaustive public projection registry only guarantees coverage of cataloged errors.

## Specific validation failures

Do not introduce a generic invalid-argument/domain-error class with only a message. Each invariant has a distinct
class and tag: `TodoIdRequiredError`, `TodoTitleInvalidError` (length/bounds), `TodoStatusInvalidError` (status),
`UserIdRequiredError`, `UserEmailInvalidError` (rule), and `UserRoleInvalidError` (role). These domain failures declare
`kind: "validation"` (HTTP 422). Transport schema validation still belongs to the framework (HTTP 400).

Storage inputs use `ObjectKeyInvalidError`, `ObjectContentTypeInvalidError`, `ObjectMetadataInvalidError` (reason),
`SignedObjectUrlMethodInvalidError` and `SignedObjectUrlExpiryInvalidError`, with `kind: "invalid-input"` (HTTP 400).
The CLI and adapters use the same signing validators so method/expiry rules cannot drift.

Not all validation is user input. `PasswordHashInvalidError` never retains the supplied secret; it denotes a broken
hasher invariant. `CacheTtlInvalidError` is a caller/configuration fault. Neither is in the public error catalog;
both have `kind: "internal"` and become sanitized 500s at transports. Storage startup errors have their own
configuration classes and also remain internal. Core's reusable identifier/state-machine helpers accept caller-supplied error factories;
they have no error definitions and do not depend on domain. The caller supplies a class from `@app/domain`.

## Boundaries

- Hono's `onError` and shared RPC middleware translate domain errors. Routes return DTOs directly.
- `_tag` is the only application error identifier (RPC: `error.data._tag`). No business `code`, code aliases or
  code-based fallback exists. HTTP errors are flat `{ _tag, message, metadata? }`; oRPC keeps its framework-owned
  transport envelope and categories. Do not match message text. Public messages are selected at the boundary;
  native `toJSON()` is not a blanket
  permission to expose developer messages or every typed field.
- Unknown exceptions/unregistered domain errors are logged and become a generic 500 with `_tag: "InternalError"`.
  Public exposure requires an entry in the projection registry; even a `not-found` kind is not permission to expose
  an unregistered error. Own-property lookup prevents prototype names such as `toString` from matching that registry.
- Adapters translate known external failures only. Redis outages throw `RateLimiterUnavailableError` (auth fails
  closed, HTTP 503, retryable). Unique email violations throw `EmailAlreadyRegisteredError` with the driver cause.
- CQRS buses preserve the original thrown value; they do not erase tags by wrapping failures.
- `runWithDomainEvents` rolls back on any throw. Successful writes and outbox appends commit together, with broadcasts
  afterward. Never swallow a failure inside the transaction unless committing is intentional.
- BullMQ converts `DomainError` with `retryable === false` (the default) to `UnrecoverableError` with its cause retained.
  Retryable domain errors and unknown exceptions propagate unchanged; configured attempts/backoff decide retries.
  The `failed` listener logs job id, attempts and error. Handle a specific error locally only for intentional recovery
  or idempotency, then rethrow everything else.

Every concrete project error class has a single definition in `@app/domain` and extends core's `DomainError`, including common
errors and CQRS registration faults. Only public failures belong to `KnownError`; startup/configuration, CQRS,
password-hasher and cache invariants stay internal. Database/internal-server errors retain `retryable = true` so
moving them under the shared base does not disable their queue retries. Configuration/CQRS errors default to
non-retryable. There are no application/core/infrastructure error aliases or legacy code-protocol adapters.
Framework-owned errors (oRPC, Hono, BullMQ) are still supplied by their libraries, not redefined in domain.
