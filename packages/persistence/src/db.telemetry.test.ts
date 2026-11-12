import { context, metrics, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { AggregationTemporality, MeterProvider, MetricReader } from "@opentelemetry/sdk-metrics";
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

import { TODO_TABLE } from "./db";
import { recordQuery, resetDbInstruments, summarizeQuery } from "./db.telemetry";
import { createTestDatabase, type TestDatabase } from "./testing/test-database";

class TestReader extends MetricReader {
  constructor() {
    super({ aggregationTemporalitySelector: () => AggregationTemporality.CUMULATIVE });
  }
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

const spans = new InMemorySpanExporter();
const tracer = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter: spans })] }).getTracer("test");
let reader: TestReader;
let db: TestDatabase;

beforeAll(async () => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  trace.setGlobalTracerProvider(new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter: spans })] }));
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.close();
  trace.disable();
  metrics.disable();
  context.disable();
});

beforeEach(() => {
  spans.reset();
  metrics.disable();
  reader = new TestReader();
  metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));
  resetDbInstruments();
});

const inSpan = <T>(fn: () => Promise<T>) =>
  tracer.startActiveSpan("request", async (span) => {
    try {
      return await fn();
    } finally {
      span.end();
    }
  });

const dbSpans = () => spans.getFinishedSpans().filter((s) => s.kind === SpanKind.CLIENT);

test("summarizeQuery keeps the operation and the DML target table", () => {
  expect(summarizeQuery('select "id" from "todo" where "id" = $1')).toEqual({ operation: "SELECT", table: "todo" });
  expect(summarizeQuery('insert into "todo" ("id") values ($1)')).toEqual({ operation: "INSERT", table: "todo" });
  expect(summarizeQuery('update "todo" set "title" = $1')).toEqual({ operation: "UPDATE", table: "todo" });
  expect(summarizeQuery('delete from "public"."todo"')).toEqual({ operation: "DELETE", table: "public" });
  expect(summarizeQuery("begin")).toEqual({ operation: "BEGIN" });
  expect(summarizeQuery("start transaction isolation level read committed")).toEqual({ operation: "BEGIN" });
  expect(summarizeQuery("with x as (select 1) select * from x")).toEqual({ operation: "WITH" });
});

test("queries inside a span become CLIENT child spans with parameterized SQL only", async () => {
  await inSpan(() => db.queryBuilder.selectFrom(TODO_TABLE).select("id").where("id", "=", "secret-id").execute());

  const [query] = dbSpans();
  const request = spans.getFinishedSpans().find((s) => s.name === "request");
  expect(query?.name).toBe(`SELECT ${TODO_TABLE}`);
  expect(query?.parentSpanContext?.spanId).toBe(request?.spanContext().spanId);
  expect(query?.attributes).toMatchObject({
    "db.system.name": "postgresql",
    "db.operation.name": "SELECT",
    "db.collection.name": TODO_TABLE,
  });
  expect(query?.attributes["db.query.text"]).toContain("$1");
  expect(JSON.stringify(query?.attributes)).not.toContain("secret-id");
  // Measured by Kysely, not zero-length.
  expect(query!.duration[0] * 1e9 + query!.duration[1]).toBeGreaterThan(0);
});

test("transaction boundaries are traced too", async () => {
  await inSpan(() => db.transactions.withTransaction(() => db.transactions.getExecutor().selectFrom(TODO_TABLE).select("id").execute()));
  expect(dbSpans().map((s) => s.name)).toEqual(["BEGIN", `SELECT ${TODO_TABLE}`, "COMMIT"]);
});

test("a failing query marks the span and the metric with the SQLSTATE", async () => {
  await expect(inSpan(() => sql`select * from missing_table`.execute(db.queryBuilder))).rejects.toThrow();

  const [query] = dbSpans();
  expect(query?.status.code).toBe(SpanStatusCode.ERROR);
  expect(query?.attributes["error.type"]).toBe("42P01");

  const { resourceMetrics } = await reader.collect();
  const point = resourceMetrics.scopeMetrics.flatMap((s) => s.metrics).find((m) => m.descriptor.name === "db.client.operation.duration")
    ?.dataPoints[0];
  expect(point?.attributes).toEqual({
    "db.system.name": "postgresql",
    "db.operation.name": "SELECT",
    "db.collection.name": "missing_table",
    "error.type": "42P01",
  });
});

test("queries outside any span are measured but not traced (no root trace per relay poll)", async () => {
  await db.queryBuilder.selectFrom(TODO_TABLE).select("id").execute();
  expect(dbSpans()).toEqual([]);

  const { resourceMetrics } = await reader.collect();
  const metric = resourceMetrics.scopeMetrics.flatMap((s) => s.metrics).find((m) => m.descriptor.name === "db.client.operation.duration");
  expect(metric?.dataPoints[0]?.value).toMatchObject({ count: 1 });
});

test("recordQuery never throws, even on a malformed event", () => {
  expect(() => recordQuery({} as never)).not.toThrow();
});
