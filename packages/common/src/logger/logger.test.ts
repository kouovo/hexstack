import { context, logs, SeverityNumber, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { InMemoryLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { TracerProvider } from "@opentelemetry/sdk-trace";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

const exported = new InMemoryLogRecordExporter();
const tracer = new TracerProvider().getTracer("test");

beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  logs.setGlobalLoggerProvider(new LoggerProvider({ processors: [new SimpleLogRecordProcessor({ exporter: exported })] }));
});

afterAll(() => {
  logs.disable();
  context.disable();
  vi.unstubAllEnvs();
});

/** The root logger is built at import time from the env, so import a fresh copy per configuration. */
async function importLogger(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("./index");
}

test("toOtelLogRecord maps level, time, message, fields and err", async () => {
  const { toOtelLogRecord } = await importLogger({});
  const line = JSON.stringify({
    level: 50,
    time: 1_700_000_000_000,
    pid: 1,
    hostname: "h",
    module: "rpc",
    trace_id: "t",
    span_id: "s",
    msg: "request error",
    err: { type: "Error", message: "boom", stack: "Error: boom\n    at x", code: "E1" },
  });

  expect(toOtelLogRecord(line)).toEqual({
    timestamp: 1_700_000_000_000,
    severityNumber: SeverityNumber.ERROR,
    severityText: "ERROR",
    body: "request error",
    attributes: {
      module: "rpc",
      "exception.type": "Error",
      "exception.message": "boom",
      "exception.stacktrace": "Error: boom\n    at x",
      "exception.details": { code: "E1" },
    },
  });
  expect(toOtelLogRecord("not json")).toBeUndefined();
});

test("traceContextFields is empty outside a span and carries the ids inside one", async () => {
  const { traceContextFields } = await importLogger({});
  expect(traceContextFields()).toEqual({});

  tracer.startActiveSpan("op", (span) => {
    const { traceId, spanId } = span.spanContext();
    expect(traceContextFields()).toEqual({ trace_id: traceId, span_id: spanId, trace_flags: "01" });
    span.end();
  });
});

test("with an OTLP endpoint every line is also emitted as a LogRecord in the caller's span", async () => {
  exported.reset();
  // NODE_ENV=production: plain JSON to stdout instead of the pino-pretty worker (this line shows up in the test output).
  const { createLogger } = await importLogger({ NODE_ENV: "production", OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318" });
  const log = createLogger("orders");

  let spanId = "";
  tracer.startActiveSpan("op", (span) => {
    spanId = span.spanContext().spanId;
    log.info({ orderId: "o1" }, "order placed");
    span.end();
  });

  const [record] = exported.getFinishedLogRecords();
  expect(record?.body).toBe("order placed");
  expect(record?.severityNumber).toBe(SeverityNumber.INFO);
  expect(record?.attributes).toEqual({ module: "orders", orderId: "o1" });
  expect(record?.spanContext?.spanId).toBe(spanId);
});

test("without an OTLP endpoint nothing is emitted", async () => {
  exported.reset();
  vi.unstubAllEnvs();
  const { createLogger } = await importLogger({ NODE_ENV: "production", OTEL_EXPORTER_OTLP_ENDPOINT: "" });
  createLogger("orders").error("hello");
  expect(exported.getFinishedLogRecords()).toEqual([]);
});
