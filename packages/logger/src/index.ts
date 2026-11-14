import { createRequire } from "node:module";

import { isSpanContextValid, logs, SeverityNumber, trace } from "@opentelemetry/api";
import type { DestinationStream, Logger, LoggerOptions, StreamEntry } from "pino";
import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";
const require = createRequire(import.meta.url);

/** Same opt-in as the API's OpenTelemetry SDK (apps/api/src/telemetry.ts): an OTLP endpoint and no OTEL_SDK_DISABLED. */
export const isOtelExportEnabled = (): boolean =>
  Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT) && process.env.OTEL_SDK_DISABLED !== "true";

const level = process.env.LOG_LEVEL ?? "info";

/** Log ↔ trace correlation: the active span's ids on every line (stdout too). Empty without an active span or SDK. */
export function traceContextFields(): Record<string, string> {
  const ctx = trace.getActiveSpan()?.spanContext();
  if (!ctx || !isSpanContextValid(ctx)) return {};
  return { trace_id: ctx.traceId, span_id: ctx.spanId, trace_flags: `0${ctx.traceFlags.toString(16)}` };
}

const prettyTransport = {
  target: require.resolve("pino-pretty"),
  options: {
    colorize: true,
    translateTime: "SYS:standard",
    ignore: "pid,hostname,trace_flags",
  },
};

export const loggerOptions: LoggerOptions = {
  level,
  mixin: traceContextFields,
  transport: isDev ? prettyTransport : undefined,
};

const SEVERITY: Record<number, { number: SeverityNumber; text: string }> = {
  10: { number: SeverityNumber.TRACE, text: "TRACE" },
  20: { number: SeverityNumber.DEBUG, text: "DEBUG" },
  30: { number: SeverityNumber.INFO, text: "INFO" },
  40: { number: SeverityNumber.WARN, text: "WARN" },
  50: { number: SeverityNumber.ERROR, text: "ERROR" },
  60: { number: SeverityNumber.FATAL, text: "FATAL" },
};

/** Fields that become part of the OTel record itself rather than attributes. */
type PinoLine = {
  level?: number;
  time?: number;
  msg?: unknown;
  pid?: unknown;
  hostname?: unknown;
  trace_id?: unknown;
  span_id?: unknown;
  trace_flags?: unknown;
  err?: { type?: unknown; message?: unknown; stack?: unknown } & Record<string, unknown>;
} & Record<string, unknown>;

/**
 * Converts a serialized pino line into an OpenTelemetry LogRecord (exported over OTLP by the SDK's log processor).
 * pino.multistream writes synchronously from the logging call, so `emit` runs in the caller's context and the SDK
 * attaches the active span. `err` maps to the semantic-convention `exception.*` attributes.
 */
export function toOtelLogRecord(line: string) {
  let parsed: PinoLine;
  try {
    parsed = JSON.parse(line) as PinoLine;
  } catch {
    return undefined;
  }
  const { level: pinoLevel, time, msg, pid: _pid, hostname: _hostname, trace_id: _t, span_id: _s, trace_flags: _f, err, ...rest } = parsed;
  const severity = SEVERITY[pinoLevel ?? 30];
  const attributes: Record<string, unknown> = { ...rest };
  if (err) {
    const { type, message, stack, ...errRest } = err;
    Object.assign(attributes, { "exception.type": type, "exception.message": message, "exception.stacktrace": stack });
    if (Object.keys(errRest).length > 0) attributes["exception.details"] = errRest;
  }
  return {
    timestamp: time,
    severityNumber: severity?.number ?? SeverityNumber.UNSPECIFIED,
    severityText: severity?.text,
    body: typeof msg === "string" ? msg : undefined,
    attributes,
  };
}

const otelLogStream: DestinationStream = {
  write(line: string) {
    const record = toOtelLogRecord(line);
    // Resolved per write: the logs API hands out a proxy until the SDK registers its provider.
    if (record) logs.getLogger("@app/logger").emit(record);
  },
};

function createRootLogger(): Logger {
  // Without OTel export keep the plain setup (single destination / pretty transport).
  if (!isOtelExportEnabled()) return pino(loggerOptions);
  // Streams accept everything (multistream defaults each to "info"); the logger's own level does the filtering.
  const streams: StreamEntry[] = [
    { level: "trace", stream: isDev ? pino.transport(prettyTransport) : pino.destination(1) },
    { level: "trace", stream: otelLogStream },
  ];
  return pino({ level, mixin: traceContextFields }, pino.multistream(streams));
}

export const logger = createRootLogger();

export type ILogger = Logger;

export const createLogger = (module: string): ILogger => logger.child({ module });

/** `{ debug, info, error }(msg, fields)` loggers, e.g. millstream's `Logger`. */
export interface FieldsLogger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

/** An `error` field becomes pino's serialized `err`. */
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
