import { createLogger } from "@app/logger";
import { Redis, type RedisOptions } from "ioredis";

import { getRedisUrl } from "./options";

export function createRedisClient(options?: RedisOptions): Redis {
  const client = options ? new Redis(options) : new Redis(getRedisUrl());
  return wire(client);
}

const logger = createLogger("RedisClient");

function wire(client: Redis): Redis {
  client.on("error", (err) => {
    logger.error({ err }, "redis client error");
  });
  client.on("ready", () => {
    logger.debug({ host: client.options.host, port: client.options.port }, "redis client ready");
  });
  return client;
}
