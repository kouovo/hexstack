import { inject, singleton } from "@app/di";
import { createLogger } from "@app/logger";
import type { EventItem } from "@millstream/cqrs";

import { DOMAIN_EVENT_BUS, DOMAIN_EVENT_OUTBOX, type DomainEventPublisher } from "../events/port";
import { DURABLE_EVENT_NAMES } from "../events/subscriptions";
import { type ApplicationTransactionOptions, type ApplicationTransactionPort, injectApplicationTransaction } from "../transaction";

/** Anything that records domain events, typically an aggregate root. */
export interface DomainEventSource {
  clearDomainEvents(): EventItem[];
}

/** Registers aggregates whose recorded events the scope collects when the work succeeds. */
export type TrackDomainEvents = (...sources: DomainEventSource[]) => void;

/**
 * The transaction boundary for business writes and their events:
 *
 * - inside the transaction: run `work`, collect the events of every tracked aggregate, publish those with a
 *   durable subscription to the outbox (it joins the transaction);
 * - after commit: publish all of them on the in-process bus (best effort).
 *
 * Both publishers are millstream `EventBus`es, which validate each payload against its event schema.
 * A throw anywhere inside rolls back the writes and the outbox rows and broadcasts nothing. A broadcast failure
 * never fails the committed operation.
 */
@singleton()
export class DomainEventScope {
  private readonly logger = createLogger("domain-events");

  constructor(
    @injectApplicationTransaction() private readonly transaction: ApplicationTransactionPort,
    @inject(DOMAIN_EVENT_OUTBOX) private readonly outbox: DomainEventPublisher,
    @inject(DOMAIN_EVENT_BUS) private readonly bus: DomainEventPublisher,
  ) {}

  async run<T>(work: (track: TrackDomainEvents) => Promise<T>, options?: ApplicationTransactionOptions): Promise<T> {
    const { result, events } = await this.transaction.run(async () => {
      const tracked = new Set<DomainEventSource>();
      const result = await work((...sources) => sources.forEach((source) => tracked.add(source)));
      // Collected after the work, so events recorded after track() are included.
      const events = [...tracked].flatMap((source) => source.clearDomainEvents());
      const durable = events.filter(({ event }) => DURABLE_EVENT_NAMES.has(event.name));
      if (durable.length) await this.outbox.publishMany(durable);
      return { result, events };
    }, options);
    await this.broadcast(events);
    return result;
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

export const injectDomainEventScope = () => inject(DomainEventScope);
