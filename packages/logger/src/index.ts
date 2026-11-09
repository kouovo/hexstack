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

/** `{ debug, info, error }(msg, fields)` loggers, e.g. millstream's `Logger`. */
export interface FieldsLogger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

/** Adapts pino to message-first loggers; an `error` field becomes pino's serialized `err`. */
const toPinoFields = (extra?: Record<string, unknown>) => {
  if (!extra || !("error" in extra)) return extra ?? {};
  const { error, ...rest } = extra;
  return { ...rest, err: error };
};

export const toFieldsLogger = (target: ILogger): FieldsLogger => {
  return {
    debug: (msg, extra) => target.debug(toPinoFields(extra), msg),
    info: (msg, extra) => target.info(toPinoFields(extra), msg),
    error: (msg, extra) => target.error(toPinoFields(extra), msg),
  };
};
