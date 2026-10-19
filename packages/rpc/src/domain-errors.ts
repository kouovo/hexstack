import { DomainError, type ErrorKind } from "@app/core";
import type { KnownError } from "@app/domain";

import { AUTH_PUBLIC_ERRORS } from "./error-projections/auth";
import { COMMON_PUBLIC_ERRORS } from "./error-projections/common";
import { STORAGE_PUBLIC_ERRORS } from "./error-projections/storage";
import { TODO_PUBLIC_ERRORS } from "./error-projections/todo";
import type { PublicError, PublicErrorMap } from "./error-projections/types";
import { USER_PUBLIC_ERRORS } from "./error-projections/user";

export type { PublicError } from "./error-projections/types";

/** A new concrete error reuses a kind; HTTP policy does not grow with the error catalog. */
export const HTTP_STATUS = {
  "invalid-input": 400,
  validation: 422,
  unauthorized: 401,
  forbidden: 403,
  "not-found": 404,
  conflict: 409,
  locked: 423,
  "rate-limited": 429,
  unavailable: 503,
  "not-implemented": 501,
  internal: 500,
} as const satisfies Record<ErrorKind, number>;

/** Public exposure is an explicit allowlist, never inferred from kind or the developer message. */
const PUBLIC_ERRORS: PublicErrorMap<KnownError> = {
  ...AUTH_PUBLIC_ERRORS,
  ...COMMON_PUBLIC_ERRORS,
  ...STORAGE_PUBLIC_ERRORS,
  ...TODO_PUBLIC_ERRORS,
  ...USER_PUBLIC_ERRORS,
};

export function isKnownError(error: unknown): error is KnownError {
  return error instanceof DomainError && Object.hasOwn(PUBLIC_ERRORS, error._tag);
}

// Passing the discriminant explicitly preserves the mapped type's tag/argument correlation.
function project<Tag extends KnownError["_tag"]>(tag: Tag, error: Extract<KnownError, { _tag: Tag }>): PublicError {
  return PUBLIC_ERRORS[tag](error);
}

/** Explicit public projection; never spread an error's fields or expose its kind/cause/stack. */
export function toPublicError(error: KnownError): PublicError {
  return project(error._tag, error);
}
