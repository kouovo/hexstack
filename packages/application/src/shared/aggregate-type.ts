/**
 * Maps an event class name to the `aggregate_type` column of the outbox.
 * Add one entry per aggregate; longer prefixes must come before shorter ones that they start with.
 */
const AGGREGATE_PREFIXES: ReadonlyArray<{ readonly pascal: string; readonly snake: string }> = [{ pascal: "Todo", snake: "todo" }];

export function deriveAggregateType(className: string): string {
  const base = className.replace(/Event$/, "");
  const match = AGGREGATE_PREFIXES.find((a) => base.startsWith(a.pascal));
  return match?.snake ?? "unknown";
}
