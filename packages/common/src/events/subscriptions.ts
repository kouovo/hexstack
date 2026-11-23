import type { EventSubscription } from "./subscription";

/** Every subscription of the running process, collected from its bounded contexts. */
export interface EventSubscriptions {
  /** After commit, best effort. */
  readonly inProcess: readonly EventSubscription[];
  /**
   * At-least-once, so handlers must be idempotent. Only events listed here are persisted to the outbox.
   * The name is the BullMQ queue name: keep it stable.
   */
  readonly outbox: readonly EventSubscription[];
}

export const EVENT_SUBSCRIPTIONS = Symbol.for("EVENT_SUBSCRIPTIONS");
/** `ReadonlySet<string>` of {@link outboxEventNames}. */
export const OUTBOX_EVENT_NAMES = Symbol.for("OUTBOX_EVENT_NAMES");

export function mergeEventSubscriptions(parts: readonly Partial<EventSubscriptions>[]): EventSubscriptions {
  const merged = {
    inProcess: parts.flatMap((part) => part.inProcess ?? []),
    outbox: parts.flatMap((part) => part.outbox ?? []),
  };
  for (const subscriptions of [merged.inProcess, merged.outbox]) {
    const names = new Set<string>();
    for (const { name } of subscriptions) {
      if (names.has(name)) throw new Error(`Event subscription already registered: ${name}`);
      names.add(name);
    }
  }
  return merged;
}

/** Names of the events the outbox must persist. */
export function outboxEventNames(subscriptions: Pick<EventSubscriptions, "outbox">): ReadonlySet<string> {
  return new Set(subscriptions.outbox.map(({ event }) => event.name));
}
