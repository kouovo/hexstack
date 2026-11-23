import type { DomainError, ErrorKind } from "../ddd/domain-error";

export interface PublicError {
  /** A concrete error's `_tag`, or one of the transport fallbacks. */
  _tag: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/** Each projector accepts only its own error variant and must preserve that variant's tag. */
export type PublicErrorMap<E extends DomainError = DomainError> = {
  [Tag in E["_tag"]]: (error: Extract<E, { _tag: Tag }>) => PublicError & { _tag: Tag };
};

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
