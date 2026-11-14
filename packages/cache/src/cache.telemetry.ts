import { type Counter, type Histogram, metrics, type Span, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

/**
 * OpenTelemetry for the cache. Every call is a no-op until an SDK is registered (apps/api/src/telemetry.ts).
 *
 * Attributes stay low-cardinality: `cache.type` is the caller's `statsType`, never a key.
 * - `app.cache.requests`        {cache.type, cache.outcome}: hit | empty (negative entry) | miss (loader ran)
 *                               | coalesced (another replica loaded it while we waited for the lock)
 *                               | bypass (version unavailable, loaded without the cache)
 * - `app.cache.load.duration`   {cache.type, cache.load.result: ok | not_found | error}: loader time on a miss (s)
 * - `app.cache.lock.fallbacks`  {cache.type}: lock unavailable, loaded without single-flight
 * - `app.cache.errors`          {cache.operation, error.type}: store errors (treated as misses / skipped writes)
 * - `app.cache.invalidations`   {cache.namespace}: version bumps
 */
const SCOPE = "@app/cache";

export type CacheOutcome = "hit" | "empty" | "miss" | "coalesced" | "bypass";

interface Instruments {
  requests: Counter;
  loadDuration: Histogram;
  lockFallbacks: Counter;
  errors: Counter;
  invalidations: Counter;
}

let instruments: Instruments | undefined;

/** Lazy: the metrics API has no proxy, so a meter taken before the SDK starts would stay a no-op forever. */
function getInstruments(): Instruments {
  if (instruments) return instruments;
  const meter = metrics.getMeter(SCOPE);
  instruments = {
    requests: meter.createCounter("app.cache.requests", { description: "Cache reads by outcome" }),
    loadDuration: meter.createHistogram("app.cache.load.duration", {
      description: "Loader duration on a cache miss",
      unit: "s",
      // The SDK's default buckets are millisecond-scale; these match the semconv HTTP duration buckets.
      advice: { explicitBucketBoundaries: [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] },
    }),
    lockFallbacks: meter.createCounter("app.cache.lock.fallbacks", { description: "Misses loaded without the single-flight lock" }),
    errors: meter.createCounter("app.cache.errors", { description: "Cache store errors (fail-open)" }),
    invalidations: meter.createCounter("app.cache.invalidations", { description: "Namespace version bumps" }),
  };
  return instruments;
}

/** Test hook: drop the cached instruments so the next call binds to the current global MeterProvider. */
export function resetCacheInstruments(): void {
  instruments = undefined;
}

export const cacheTelemetry = {
  request(type: string, outcome: CacheOutcome): void {
    getInstruments().requests.add(1, { "cache.type": type, "cache.outcome": outcome });
  },
  load(type: string, seconds: number, result: "ok" | "not_found" | "error"): void {
    getInstruments().loadDuration.record(seconds, { "cache.type": type, "cache.load.result": result });
  },
  lockFallback(type: string): void {
    getInstruments().lockFallbacks.add(1, { "cache.type": type });
  },
  error(operation: string, errorType: string): void {
    getInstruments().errors.add(1, { "cache.operation": operation, "error.type": errorType });
  },
  invalidation(namespace: string): void {
    getInstruments().invalidations.add(1, { "cache.namespace": namespace });
  },
};

/**
 * An INTERNAL span around a read-through, so the loader's DB calls nest under it and a trace shows whether the
 * cache answered. `expected` errors (e.g. a replayed NotFoundException) do not mark the span as failed.
 */
export async function withCacheSpan<T>(
  name: string,
  attributes: Record<string, string | boolean>,
  fn: (span: Span) => Promise<T>,
  expected: (err: unknown) => boolean,
): Promise<T> {
  return trace.getTracer(SCOPE).startActiveSpan(name, { kind: SpanKind.INTERNAL, attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (err) {
      if (!expected(err)) {
        span.recordException(err instanceof Error ? err : String(err));
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      throw err;
    } finally {
      span.end();
    }
  });
}
