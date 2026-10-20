import { DomainError } from "@app/core";

export class IdentifierRequiredError extends DomainError<"IdentifierRequiredError"> {
  readonly _tag = "IdentifierRequiredError";
  readonly kind = "validation";
  constructor(readonly label: string) {
    super(`${label} is required`);
  }
}

export class StateTransitionNotAllowedError extends DomainError<"StateTransitionNotAllowedError"> {
  readonly _tag = "StateTransitionNotAllowedError";
  readonly kind = "conflict";
  constructor(
    readonly subject: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Cannot transition ${subject} from ${from} to ${to}`);
  }
}

export class ConflictException extends DomainError<"ConflictException"> {
  readonly _tag = "ConflictException";
  readonly kind = "conflict";
}

export class DatabaseException extends DomainError<"DatabaseException"> {
  readonly _tag = "DatabaseException";
  readonly kind = "internal";
  override readonly retryable = true;
  constructor(
    message = "Database error",
    cause?: unknown,
    readonly metadata?: unknown,
  ) {
    super(message, { cause });
  }
}

export class UnauthorizedException extends DomainError<"UnauthorizedException"> {
  readonly _tag = "UnauthorizedException";
  readonly kind = "unauthorized";
  constructor(message = "Unauthorized") {
    super(message);
  }
}

export class ForbiddenException extends DomainError<"ForbiddenException"> {
  readonly _tag = "ForbiddenException";
  readonly kind = "forbidden";
  constructor(message = "Forbidden") {
    super(message);
  }
}

export class NotFoundException extends DomainError<"NotFoundException"> {
  readonly _tag = "NotFoundException";
  readonly kind = "not-found";
  constructor(message = "Not found") {
    super(message);
  }
}

export class InternalServerErrorException extends DomainError<"InternalServerErrorException"> {
  readonly _tag = "InternalServerErrorException";
  readonly kind = "internal";
  override readonly retryable = true;
  constructor(
    message = "Internal server error",
    cause?: unknown,
    readonly metadata?: unknown,
  ) {
    super(message, { cause });
  }
}

export class NotImplementException extends DomainError<"NotImplementException"> {
  readonly _tag = "NotImplementException";
  readonly kind = "not-implemented";
  constructor(message = "Not implemented") {
    super(message);
  }
}

export class ResourceBusyException extends DomainError<"ResourceBusyException"> {
  readonly _tag = "ResourceBusyException";
  readonly kind = "locked";
}

/** A distributed lock stayed held past the retry budget. Safe to retry shortly; `resource` is internal, never public. */
export class LockContentionError extends DomainError<"LockContentionError"> {
  readonly _tag = "LockContentionError";
  readonly kind = "locked";
  override readonly retryable = true;
  constructor(
    readonly resource: string,
    readonly ttlMs: number,
  ) {
    super("Resource is busy, please try again shortly.");
  }
}

export class TooManyRequestsException extends DomainError<"TooManyRequestsException"> {
  readonly _tag = "TooManyRequestsException";
  readonly kind = "rate-limited";
  constructor(message = "Too many requests") {
    super(message);
  }
}

export type CommonError =
  | IdentifierRequiredError
  | StateTransitionNotAllowedError
  | ConflictException
  | UnauthorizedException
  | ForbiddenException
  | NotFoundException
  | NotImplementException
  | ResourceBusyException
  | LockContentionError
  | TooManyRequestsException;
