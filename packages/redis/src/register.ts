import { container, instanceCachingFactory } from "@app/di";

import { REDIS_CLIENT } from "./client";
import { createRedisClient } from "./factory";

export function registerRedis() {
  container.register(REDIS_CLIENT, {
    useFactory: instanceCachingFactory(() => createRedisClient()),
  });
}
