import { AUTHORIZATION_POLICY } from "@app/common/auth";
import type { BoundedContext } from "@app/common/service";

import { Argon2PasswordHasher } from "../adapters/argon2-password-hasher";
import { RedisTokenBucketRateLimiter } from "../adapters/redis-rate-limiter";
import { RoleAuthorizationPolicy } from "../adapters/role-authorization-policy";
import { SessionRepository } from "../adapters/session.repository";
import { SESSION_REPO } from "../adapters/session.repository";
import { UserRepository } from "../adapters/user.repository";
import { USER_REPO } from "../adapters/user.repository";
import { IDENTITY_HANDLERS } from "../app/app";
import { PASSWORD_HASHER } from "../app/password-hasher.port";
import { RATE_LIMITER } from "../app/rate-limiter.port";
import { IDENTITY_SUBSCRIPTIONS } from "../ports/events";
import { IDENTITY_PUBLIC_ERRORS } from "../ports/public-errors";

export const identityContext: BoundedContext = {
  name: "identity",
  /** Needs registerRedis() (rate limiter). */
  registerAdapters(container) {
    container.registerSingleton(USER_REPO, UserRepository);
    container.registerSingleton(SESSION_REPO, SessionRepository);
    container.registerSingleton(PASSWORD_HASHER, Argon2PasswordHasher);
    container.registerSingleton(RATE_LIMITER, RedisTokenBucketRateLimiter);
  },
  registerServices(container) {
    container.registerInstance(AUTHORIZATION_POLICY, new RoleAuthorizationPolicy());
  },
  handlers: IDENTITY_HANDLERS,
  subscriptions: IDENTITY_SUBSCRIPTIONS,
  publicErrors: IDENTITY_PUBLIC_ERRORS,
};
