import type { AuthError } from "@app/domain";

import type { PublicErrorMap } from "./types";

export const AUTH_PUBLIC_ERRORS = {
  RateLimitedError: (error) => ({
    _tag: error._tag,
    message:
      error.policy === "sign-in"
        ? "Too many sign-in attempts. Wait a minute and try again."
        : "Too many sign-up attempts from this network. Wait a minute and try again.",
    metadata: { retryAfterSeconds: error.retryAfterSeconds },
  }),
  RateLimiterUnavailableError: (error) => ({
    _tag: error._tag,
    message: "Signing in is temporarily unavailable. Please try again in a moment.",
  }),
  AccountNotFoundError: (error) => ({
    _tag: error._tag,
    message: "No account uses this email. Check the address or create an account.",
  }),
  IncorrectPasswordError: (error) => ({ _tag: error._tag, message: "Incorrect password." }),
  PasswordPolicyViolationError: (error) => ({ _tag: error._tag, message: error.rule }),
  EmailAlreadyRegisteredError: (error) => ({
    _tag: error._tag,
    message: "An account with this email already exists. Sign in instead.",
  }),
  SessionUserMissingError: (error) => ({ _tag: error._tag, message: "Your session has ended. Please sign in again." }),
} satisfies PublicErrorMap<AuthError>;
