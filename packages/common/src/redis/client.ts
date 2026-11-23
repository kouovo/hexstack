export type { Redis, RedisOptions } from "ioredis";
import { inject } from "../di";

export const REDIS_CLIENT = Symbol.for("REDIS_CLIENT");
export const injectRedisClient = () => inject(REDIS_CLIENT);
