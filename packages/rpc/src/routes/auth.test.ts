import {
  AccountNotFoundError,
  EmailAlreadyRegisteredError,
  IncorrectPasswordError,
  RateLimitedError,
  RateLimiterUnavailableError,
  SessionUserMissingError,
  type SignInError,
  type SignUpError,
  PasswordPolicyViolationError,
} from "@app/domain";
import { expect, test } from "vitest";

import { HTTP_STATUS, toPublicError } from "../domain-errors";

const variants = [
  new RateLimitedError({ policy: "sign-in", retryAfterSeconds: 60 }),
  new RateLimitedError({ policy: "sign-up", retryAfterSeconds: 60 }),
  new RateLimiterUnavailableError({ policy: "sign-in", cause: new Error("connect ECONNREFUSED 10.0.0.5:6379") }),
  new AccountNotFoundError(),
  new IncorrectPasswordError({ userId: "usr_1" }),
  new PasswordPolicyViolationError({ rule: "Password must be at least 8 characters" }),
  new EmailAlreadyRegisteredError({ detectedBy: "unique-constraint" }),
  new SessionUserMissingError({ userId: "usr_1" }),
];

test("auth failures use one tag-only public contract and exhaustive HTTP statuses", () => {
  expect(variants.map((error) => [toPublicError(error)._tag, HTTP_STATUS[error.kind]])).toEqual([
    ["RateLimitedError", 429],
    ["RateLimitedError", 429],
    ["RateLimiterUnavailableError", 503],
    ["AccountNotFoundError", 404],
    ["IncorrectPasswordError", 401],
    ["PasswordPolicyViolationError", 400],
    ["EmailAlreadyRegisteredError", 409],
    ["SessionUserMissingError", 401],
  ]);
  for (const error of variants) {
    expect(toPublicError(error)).not.toHaveProperty("code");
    expect(toPublicError(error)).not.toHaveProperty("dataCode");
  }
});

test("public failures never contain internal messages, causes, user ids or infrastructure details", () => {
  for (const error of variants) {
    const publicFailure = JSON.stringify(toPublicError(error));
    expect(publicFailure).not.toContain(error.message);
    expect(publicFailure).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|usr_1|unique-constraint|Redis|fail closed/);
  }
  expect(toPublicError(variants[5]!).message).toBe("Password must be at least 8 characters");
});

// @ts-expect-error -- EmailAlreadyRegisteredError is unhandled.
const incompleteMapping: Record<(SignInError | SignUpError)["_tag"], number> = {
  RateLimitedError: 429,
  RateLimiterUnavailableError: 503,
  AccountNotFoundError: 404,
  IncorrectPasswordError: 401,
  PasswordPolicyViolationError: 400,
};
test("the auth mapping is exhaustive at compile time", () => {
  expect(incompleteMapping).toBeTypeOf("object");
});
