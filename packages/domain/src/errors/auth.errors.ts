import { DomainError } from "@app/core";

import type { EmailAlreadyRegisteredError, PasswordPolicyViolationError } from "./user.errors";

export class RateLimitedError extends DomainError<"RateLimitedError"> {
  readonly _tag = "RateLimitedError";
  readonly kind = "rate-limited";
  readonly policy: "sign-in" | "sign-up";
  readonly retryAfterSeconds: number;

  constructor(args: { policy: "sign-in" | "sign-up"; retryAfterSeconds: number }) {
    super(
      `${args.policy} rate limit reached; one attempt refills within ${args.retryAfterSeconds}s. The request was rejected before any password hashing.`,
    );
    this.policy = args.policy;
    this.retryAfterSeconds = args.retryAfterSeconds;
  }
}

/** Redis failed: authentication fails closed. Retrying after recovery can help. */
export class RateLimiterUnavailableError extends DomainError<"RateLimiterUnavailableError"> {
  readonly _tag = "RateLimiterUnavailableError";
  readonly kind = "unavailable";
  override readonly retryable = true;
  readonly policy: string;

  constructor(args: { policy: string; cause: unknown }) {
    super(`Rate limiter for "${args.policy}" is unavailable; the request was rejected (fail closed). Check Redis connectivity.`, {
      cause: args.cause,
    });
    this.policy = args.policy;
  }
}

/** Explicit account existence is intentional (see README "Authentication"). */
export class AccountNotFoundError extends DomainError<"AccountNotFoundError"> {
  readonly _tag = "AccountNotFoundError";
  readonly kind = "not-found";
  constructor() {
    super("Sign-in rejected: no account uses this email. No session was created.");
  }
}

export class IncorrectPasswordError extends DomainError<"IncorrectPasswordError"> {
  readonly _tag = "IncorrectPasswordError";
  readonly kind = "unauthorized";
  readonly userId: string;
  constructor(args: { userId: string }) {
    super(`Sign-in rejected for user ${args.userId}: password did not verify. No session was created.`);
    this.userId = args.userId;
  }
}

export class SessionUserMissingError extends DomainError<"SessionUserMissingError"> {
  readonly _tag = "SessionUserMissingError";
  readonly kind = "unauthorized";
  readonly userId: string;
  constructor(args: { userId: string }) {
    super(`Signed-in user ${args.userId} no longer exists; the client must sign in again.`);
    this.userId = args.userId;
  }
}

export type SignInError = RateLimitedError | RateLimiterUnavailableError | AccountNotFoundError | IncorrectPasswordError;
export type SignUpError = RateLimitedError | RateLimiterUnavailableError | PasswordPolicyViolationError | EmailAlreadyRegisteredError;

/** Catalog for the auth transport boundary, not a checked throws declaration. */
export type AuthError =
  | RateLimitedError
  | RateLimiterUnavailableError
  | AccountNotFoundError
  | IncorrectPasswordError
  | SessionUserMissingError
  | PasswordPolicyViolationError
  | EmailAlreadyRegisteredError;
