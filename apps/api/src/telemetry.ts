import { isOtelExportEnabled } from "@app/logger";
import { metrics } from "@opentelemetry/api";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { startNodeSdk } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

import { SERVICE_NAME, SERVICE_VERSION } from "./service-info";

/**
 * Must be the first import of the entrypoint: the SDK has to own the global providers before app code
 * grabs tracers/meters. Opt-in via OTEL_EXPORTER_OTLP_ENDPOINT; without it every `@opentelemetry/api` call stays a no-op.
 *
 * Exporters, batching and intervals come from the standard OTEL_* variables, e.g. OTEL_EXPORTER_OTLP_PROTOCOL
 * (default http/protobuf), OTEL_METRIC_EXPORT_INTERVAL (default 60 s), OTEL_TRACES_SAMPLER, OTEL_BSP_*, or
 * OTEL_{TRACES,METRICS,LOGS}_EXPORTER=none to turn one signal off. Traces, metrics and logs all default to OTLP; logs
 * are the pino lines @app/logger emits as LogRecords.
 */
const sdk = isOtelExportEnabled()
  ? startNodeSdk({
      resourceAttributes: { [ATTR_SERVICE_NAME]: SERVICE_NAME, [ATTR_SERVICE_VERSION]: SERVICE_VERSION },
      // Event loop delay/utilization, V8 heap and GC (perf_hooks; no module patching, so bundling is fine).
      // Keep the default `monitoringPrecision` (10 ms): it is the delay histogram's sampling resolution, not an export
      // interval, and large values show up as that much "delay".
      instrumentations: [new RuntimeNodeInstrumentation()],
    })
  : undefined;

if (sdk) registerProcessMetrics();

/** Process CPU and RSS (semantic-convention names), which the runtime instrumentation does not report. */
function registerProcessMetrics(): void {
  const meter = metrics.getMeter("api.process");
  meter.createObservableCounter("process.cpu.time", { description: "CPU seconds used by the process", unit: "s" }).addCallback((result) => {
    const { user, system } = process.cpuUsage();
    result.observe(user / 1e6, { "cpu.mode": "user" });
    result.observe(system / 1e6, { "cpu.mode": "system" });
  });
  meter
    .createObservableUpDownCounter("process.memory.usage", { description: "Resident set size of the process", unit: "By" })
    .addCallback((result) => result.observe(process.memoryUsage.rss()));
}

/** Flushes buffered spans/metrics/logs. Bounded so a dead collector cannot block process exit. */
export async function shutdownTelemetry(timeoutMs = 5_000): Promise<void> {
  if (!sdk) return;
  await Promise.race([sdk.shutdown(), new Promise<void>((resolve) => setTimeout(resolve, timeoutMs).unref())]);
}
