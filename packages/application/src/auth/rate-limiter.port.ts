import { inject } from "@app/di";

/** Token bucket: `capacity` tokens, one token added back every `refillIntervalMs`. */
export interface RateLimitPolicy {
  name: string;
  capacity: number;
  refillIntervalMs: number;
}

/**
 * Sign-in: per account, 5 attempts then 1/min (~500k guesses/year), no lockout.
 * Sign-up: per client address, since there is no account yet; generous to tolerate shared networks.
 */
export const SIGN_IN_RATE_LIMIT: RateLimitPolicy = { name: "sign-in", capacity: 5, refillIntervalMs: 60_000 };
export const SIGN_UP_RATE_LIMIT: RateLimitPolicy = { name: "sign-up", capacity: 10, refillIntervalMs: 60_000 };

export interface RateLimiter {
  /**
   * Takes one token: true = allowed, false = bucket empty.
   * @throws {RateLimiterUnavailableError} on backend failure (callers fail closed).
   */
  consume(policy: RateLimitPolicy, key: string): Promise<boolean>;
}

/** Upper bound until the next token: one refill interval. */
export const retryAfterSeconds = (policy: RateLimitPolicy): number => Math.ceil(policy.refillIntervalMs / 1000);

export const RATE_LIMITER = Symbol.for("RATE_LIMITER");
export const injectRateLimiter = () => inject(RATE_LIMITER);
