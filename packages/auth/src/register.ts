import { PASSWORD_HASHER, RATE_LIMITER } from "@app/application";
import { container } from "@app/di";

import { Argon2PasswordHasher } from "./argon2-password-hasher";
import { RedisTokenBucketRateLimiter } from "./redis-rate-limiter";

/** Binds the auth ports. Must run before registerDomainCqrsHandlers() (handlers inject these). Needs registerRedis(). */
export function registerAuth(): void {
  container.registerSingleton(PASSWORD_HASHER, Argon2PasswordHasher);
  container.registerSingleton(RATE_LIMITER, RedisTokenBucketRateLimiter);
}
