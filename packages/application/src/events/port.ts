import type { EventItem } from "@millstream/cqrs";

/** Publishes recorded domain events (a millstream `EventBus` in the adapters). */
export interface DomainEventPublisher {
  publishMany(events: readonly EventItem[]): Promise<unknown>;
}

/** Durable: publishes into the transactional outbox, joining the ambient business transaction. */
export const DOMAIN_EVENT_OUTBOX = Symbol.for("DOMAIN_EVENT_OUTBOX");
/** In-process, best effort: delivers to the in-process subscriptions; used after commit. */
export const DOMAIN_EVENT_BUS = Symbol.for("DOMAIN_EVENT_BUS");
