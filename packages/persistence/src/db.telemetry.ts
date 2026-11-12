import { type Histogram, metrics, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type { LogEvent } from "kysely";

/**
 * OpenTelemetry for SQL, fed by Kysely's `log` hook (see kysely.ts). Kysely times every query on a connection,
 * BEGIN/COMMIT/ROLLBACK included, and calls the hook in the caller's async context right after the query settles, so a
 * CLIENT span can be recorded after the fact with the measured start/end and the caller's active span as parent.
 * No driver patching: postgres.js has no official instrumentation, and the API bundle needs none.
 *
 * - Span `<OPERATION> <table>` (e.g. `SELECT todos`), only under an existing span: the outbox relay polls every second
 *   outside any trace and would otherwise start a root trace per poll.
 * - `db.query.text` is Kysely's parameterized SQL ($1, $2, …): it never contains the bound values.
 * - Histogram `db.client.operation.duration` (s) for every query, traced or not.
 *
 * All no-ops until an OTel SDK is registered.
 */
const SCOPE = "@app/persistence";
const MAX_QUERY_TEXT = 2_048;

let duration: Histogram | undefined;

/** Lazy: a meter taken before the SDK starts would stay a no-op forever (the metrics API has no proxy). */
function getDuration(): Histogram {
  duration ??= metrics.getMeter(SCOPE).createHistogram("db.client.operation.duration", {
    description: "Duration of database client operations",
    unit: "s",
    advice: { explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10] },
  });
  return duration;
}

/** Test hook: rebind to the current global MeterProvider. */
export function resetDbInstruments(): void {
  duration = undefined;
}

const TABLE_AFTER: Record<string, RegExp> = {
  SELECT: /\bfrom\s+("?)([\w.]+)\1/i,
  DELETE: /\bfrom\s+("?)([\w.]+)\1/i,
  INSERT: /\binto\s+("?)([\w.]+)\1/i,
  UPDATE: /^\s*update\s+("?)([\w.]+)\1/i,
};

/** Low-cardinality summary of a statement: its leading keyword and, for plain DML, the target table. */
export function summarizeQuery(sqlText: string): { operation: string; table?: string } {
  const keyword = /^\s*(\w+)/.exec(sqlText)?.[1]?.toUpperCase() ?? "UNKNOWN";
  // postgres.js opens transactions with `start transaction`, PGlite and others with `begin`: name both the same.
  const operation = keyword === "START" ? "BEGIN" : keyword;
  const table = TABLE_AFTER[operation]?.exec(sqlText)?.[2];
  return table ? { operation, table } : { operation };
}

function errorType(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code; // SQLSTATE
  return error instanceof Error ? error.name : "unknown";
}

/** Never throws: Kysely awaits its log hook inside `executeQuery`, so an error here would fail the query itself. */
export function recordQuery(event: LogEvent): void {
  try {
    record(event);
  } catch {
    // Telemetry is best effort.
  }
}

function record(event: LogEvent): void {
  const { operation, table } = summarizeQuery(event.query.sql);
  const failed = event.level === "error";
  const metricAttributes = {
    "db.system.name": "postgresql",
    "db.operation.name": operation,
    ...(table ? { "db.collection.name": table } : {}),
    ...(failed ? { "error.type": errorType(event.error) } : {}),
  };
  getDuration().record(event.queryDurationMillis / 1000, metricAttributes);

  if (!trace.getActiveSpan()) return;
  const endTime = performance.timeOrigin + performance.now();
  const span = trace.getTracer(SCOPE).startSpan(table ? `${operation} ${table}` : operation, {
    kind: SpanKind.CLIENT,
    startTime: endTime - event.queryDurationMillis,
    attributes: { ...metricAttributes, "db.query.text": event.query.sql.slice(0, MAX_QUERY_TEXT) },
  });
  if (failed) {
    span.recordException(event.error instanceof Error ? event.error : String(event.error));
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
  span.end(endTime);
}
