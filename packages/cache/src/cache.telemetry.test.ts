import { NotFoundException } from "@app/domain";
import { context, metrics, SpanStatusCode, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { AggregationTemporality, MeterProvider, MetricReader } from "@opentelemetry/sdk-metrics";
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import Keyv from "keyv";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

import { resetCacheInstruments } from "./cache.telemetry";
import { KeyvCacheAdapter } from "./keyv-cache.adapter";

class TestReader extends MetricReader {
  constructor() {
    super({ aggregationTemporalitySelector: () => AggregationTemporality.CUMULATIVE });
  }
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

const spans = new InMemorySpanExporter();
const tracerProvider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter: spans })] });
const contextManager = new AsyncLocalStorageContextManager();
let reader: TestReader;

beforeAll(() => {
  context.setGlobalContextManager(contextManager.enable());
  trace.setGlobalTracerProvider(tracerProvider);
});

afterAll(() => {
  trace.disable();
  metrics.disable();
  context.disable();
});

beforeEach(() => {
  spans.reset();
  metrics.disable();
  reader = new TestReader();
  metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));
  resetCacheInstruments();
});

/** Data points of one metric as `{ attributes, value }`. */
async function points(name: string) {
  const { resourceMetrics } = await reader.collect();
  const metric = resourceMetrics.scopeMetrics.flatMap((s) => s.metrics).find((m) => m.descriptor.name === name);
  return (metric?.dataPoints ?? []).map((p) => ({ attributes: p.attributes, value: p.value }));
}

const notFound = async () => {
  throw new NotFoundException("gone");
};
const slow = () => new Promise<string>((resolve) => setTimeout(() => resolve("v"), 20));

const requests = async () =>
  Object.fromEntries(
    (await points("app.cache.requests")).map((p) => [`${p.attributes["cache.type"]}:${p.attributes["cache.outcome"]}`, p.value]),
  );

test("counts miss then hit per statsType and times the loader", async () => {
  const cache = new KeyvCacheAdapter(new Keyv());
  await cache.getOrSet("k", async () => "v", 60, { statsType: "users" });
  await cache.getOrSet("k", async () => "v", 60, { statsType: "users" });

  expect(await requests()).toEqual({ "users:miss": 1, "users:hit": 1 });
  const [load] = await points("app.cache.load.duration");
  expect(load?.attributes).toEqual({ "cache.type": "users", "cache.load.result": "ok" });
  expect(load?.value).toMatchObject({ count: 1, buckets: { boundaries: expect.arrayContaining([0.001, 0.01, 0.1, 1]) } });
});

test("negative entries count as empty, and a concurrent locked miss as coalesced", async () => {
  const cache = new KeyvCacheAdapter(new Keyv());
  await expect(cache.getOrSet("ghost", notFound, 60, { statsType: "t" })).rejects.toThrow("gone");
  await expect(cache.getOrSet("ghost", notFound, 60, { statsType: "t" })).rejects.toThrow("gone");

  await Promise.all([
    cache.getOrSet("hot", slow, 60, { statsType: "t", lock: true }),
    cache.getOrSet("hot", slow, 60, { statsType: "t", lock: true }),
  ]);

  expect(await requests()).toEqual({ "t:miss": 2, "t:empty": 1, "t:coalesced": 1 });
  const loads = await points("app.cache.load.duration");
  expect(loads.map((p) => p.attributes["cache.load.result"]).toSorted()).toEqual(["not_found", "ok"]);
});

test("version store failure is a bypass, not a crash", async () => {
  const versions = { get: async () => Promise.reject(new Error("down")), incr: async () => 1 };
  const cache = new KeyvCacheAdapter(new Keyv(), versions);

  await expect(cache.getOrSetVersioned("todos", async () => "v", 60, { statsType: "list" })).resolves.toBe("v");
  expect(await requests()).toEqual({ "list:bypass": 1 });
  expect((await points("app.cache.errors"))[0]?.attributes).toEqual({ "cache.operation": "version", "error.type": "Error" });
});

test("bumpVersion counts invalidations per namespace", async () => {
  const cache = new KeyvCacheAdapter(new Keyv());
  await cache.bumpVersion("todos");
  await cache.bumpVersion("todos");
  expect(await points("app.cache.invalidations")).toEqual([{ attributes: { "cache.namespace": "todos" }, value: 2 }]);
});

test("a read-through span wraps the loader and records the outcome", async () => {
  const cache = new KeyvCacheAdapter(new Keyv());
  const tracer = trace.getTracer("test");
  await cache.getOrSetVersioned("todos", async () => tracer.startActiveSpan("db.query", async (s) => (s.end(), "rows")), 60, {
    statsType: "list",
    queryKey: "q",
    lock: true,
  });

  const finished = spans.getFinishedSpans();
  const cacheSpan = finished.find((s) => s.name === "cache.get_or_set list");
  const dbSpan = finished.find((s) => s.name === "db.query");
  expect(cacheSpan?.attributes).toMatchObject({
    "cache.type": "list",
    "cache.lock": true,
    "cache.namespace": "todos",
    "cache.outcome": "miss",
  });
  expect(dbSpan?.parentSpanContext?.spanId).toBe(cacheSpan?.spanContext().spanId);
});

test("a replayed NotFoundException does not fail the span; a loader crash does", async () => {
  const cache = new KeyvCacheAdapter(new Keyv());
  await expect(
    cache.getOrSet(
      "ghost",
      async () => {
        throw new NotFoundException("gone");
      },
      60,
    ),
  ).rejects.toThrow();
  await expect(
    cache.getOrSet(
      "boom",
      async () => {
        throw new Error("db down");
      },
      60,
    ),
  ).rejects.toThrow();

  const [notFound, crash] = spans.getFinishedSpans();
  expect(notFound?.status.code).toBe(SpanStatusCode.UNSET);
  expect(crash?.status.code).toBe(SpanStatusCode.ERROR);
  expect(crash?.events.map((e) => e.name)).toEqual(["exception"]);
});
