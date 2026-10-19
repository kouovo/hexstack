import { inject } from "@app/di";

export const REDIS_CLIENT = Symbol.for("REDIS_CLIENT");
export const injectRedisClient = () => inject(REDIS_CLIENT);
