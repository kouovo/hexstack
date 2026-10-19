export * from "./auth.errors";
export * from "./cache.errors";
export * from "./common.errors";
export * from "./cqrs.errors";
export * from "./storage.errors";
export * from "./storage-configuration.errors";
export * from "./todo.errors";
export * from "./user.errors";

import type { AuthError } from "./auth.errors";
import type { CommonError } from "./common.errors";
import type { StorageError } from "./storage.errors";
import type { TodoError } from "./todo.errors";
import type { UserError } from "./user.errors";

/** Public boundary catalog. Internal/configuration faults are intentionally excluded. */
export type KnownError = AuthError | CommonError | StorageError | TodoError | UserError;
