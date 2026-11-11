import type { EventItem } from "@millstream/cqrs";

export interface DomainEventPublisher {
  publishMany(events: readonly EventItem[]): Promise<unknown>;
}

/** Joins the ambient business transaction. */
export const DOMAIN_EVENT_OUTBOX = Symbol.for("DOMAIN_EVENT_OUTBOX");
/** Best effort, after commit. */
export const DOMAIN_EVENT_BUS = Symbol.for("DOMAIN_EVENT_BUS");
