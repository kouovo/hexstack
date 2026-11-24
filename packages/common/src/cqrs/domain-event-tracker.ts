import type { EventItem } from "@millstream/cqrs";

import { inject, singleton } from "../di";
import { DOMAIN_EVENT_BUS, DOMAIN_EVENT_OUTBOX, type DomainEventPublisher } from "../events/port";
import { OUTBOX_EVENT_NAMES } from "../events/subscriptions";
import { createLogger } from "../logger";
import { type ApplicationTransactionPort, injectApplicationTransaction, type TransactionHooks } from "./transaction.port";

export interface DomainEventSource {
  hasDomainEvents(): boolean;
  clearDomainEvents(): EventItem[];
}

/**
 * Repositories call {@link track} with every aggregate they persist; the use case only opens a transaction. Before the
 * outermost commit the tracked aggregates' events are collected and the durable ones written to the outbox (same
 * transaction); after the commit every event is broadcast in-process (best effort). A rollback drops both.
 * No savepoints: an outer transaction that catches an inner throw commits the inner writes, and their events with them.
 */
@singleton()
export class DomainEventTracker {
  private readonly logger = createLogger("domain-events");
  /** Aggregates tracked per outermost transaction; collected once, before its commit. */
  private readonly pending = new WeakMap<TransactionHooks, { sources: Set<DomainEventSource>; collected: boolean }>();

  constructor(
    @injectApplicationTransaction() private readonly transaction: ApplicationTransactionPort,
    @inject(DOMAIN_EVENT_OUTBOX) private readonly outbox: DomainEventPublisher,
    @inject(DOMAIN_EVENT_BUS) private readonly bus: DomainEventPublisher,
    /** Events some outbox subscription consumes; only these are persisted. */
    @inject(OUTBOX_EVENT_NAMES) private readonly durableEvents: ReadonlySet<string>,
  ) {}

  /**
   * Registers persisted aggregates with the active transaction. Events recorded after this call, up to the commit,
   * are included. Throws outside a transaction when an aggregate has events: they could never be published atomically.
   */
  track(...sources: DomainEventSource[]): void {
    const hooks = this.transaction.current();
    if (!hooks) {
      if (sources.some((source) => source.hasDomainEvents())) {
        throw new Error(
          "An aggregate with domain events was persisted outside a transaction; wrap the use case in ApplicationTransactionPort.run",
        );
      }
      return;
    }
    let entry = this.pending.get(hooks);
    if (!entry) {
      entry = this.register(hooks);
      this.pending.set(hooks, entry);
    }
    if (entry.collected) throw new Error("An aggregate was tracked after its transaction's events were collected");
    for (const source of sources) entry.sources.add(source);
  }

  private register(hooks: TransactionHooks) {
    const entry = { sources: new Set<DomainEventSource>(), collected: false };
    let events: EventItem[] = [];
    hooks.beforeCommit(async () => {
      entry.collected = true;
      events = [...entry.sources].flatMap((source) => source.clearDomainEvents());
      const durable = events.filter(({ event }) => this.durableEvents.has(event.name));
      if (durable.length) await this.outbox.publishMany(durable);
    });
    hooks.afterCommit(() => this.broadcast(events));
    return entry;
  }

  private async broadcast(events: EventItem[]): Promise<void> {
    if (!events.length) return;
    try {
      await this.bus.publishMany(events);
    } catch (error) {
      this.logger.warn({ err: error, eventIds: events.map(({ uuid }) => uuid) }, "post-commit broadcast failed; durable outbox retained");
    }
  }
}

export const injectDomainEventTracker = () => inject(DomainEventTracker);
