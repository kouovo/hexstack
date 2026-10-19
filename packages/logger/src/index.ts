import { createRequire } from "node:module";

import type { Logger, LoggerOptions } from "pino";
import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";
const require = createRequire(import.meta.url);

export const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  transport: isDev
    ? {
        target: require.resolve("pino-pretty"),
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
};

export const logger = pino(loggerOptions);

export type ILogger = Logger;

export const createLogger = (module: string): ILogger => logger.child({ module });
