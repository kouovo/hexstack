import { AsyncLocalStorage } from "node:async_hooks";

import { inject, singleton } from "@app/di";
import { createLogger } from "@app/logger";
import type { EventItem } from "@millstream/cqrs";

import { DOMAIN_EVENT_BUS, DOMAIN_EVENT_OUTBOX, type DomainEventPublisher } from "../events/port";
import { OUTBOX_EVENT_NAMES } from "../events/subscriptions";
import { type ApplicationTransactionOptions, type ApplicationTransactionPort, injectApplicationTransaction } from "../transaction";

export interface DomainEventSource {
  clearDomainEvents(): EventItem[];
}

export type TrackDomainEvents = (...sources: DomainEventSource[]) => void;

/**
 * Business writes + their events: durable events go to the outbox inside the transaction, every event is broadcast
 * in-process after commit (best effort). A nested `run` joins the outer one, so events go out once, after the
 * outermost commit. No savepoints: an outer scope that catches an inner throw still commits the inner writes.
 * Don't open a scope inside a bare `ApplicationTransactionPort.run`: it would broadcast before that commit.
 */
@singleton()
export class DomainEventScope {
  private readonly logger = createLogger("domain-events");
  private readonly active = new AsyncLocalStorage<Set<DomainEventSource>>();

  constructor(
    @injectApplicationTransaction() private readonly transaction: ApplicationTransactionPort,
    @inject(DOMAIN_EVENT_OUTBOX) private readonly outbox: DomainEventPublisher,
    @inject(DOMAIN_EVENT_BUS) private readonly bus: DomainEventPublisher,
  ) {}

  async run<T>(work: (track: TrackDomainEvents) => Promise<T>, options?: ApplicationTransactionOptions): Promise<T> {
    const outer = this.active.getStore();
    if (outer) {
      const tracked = new Set<DomainEventSource>();
      const result = await work((...sources) => sources.forEach((source) => tracked.add(source)));
      for (const source of tracked) outer.add(source);
      return result;
    }

    const tracked = new Set<DomainEventSource>();
    const { result, events } = await this.transaction.run(async () => {
      const result = await this.active.run(tracked, () => work((...sources) => sources.forEach((source) => tracked.add(source))));
      // Collected after the work, so events recorded after track() are included.
      const events = [...tracked].flatMap((source) => source.clearDomainEvents());
      const durable = events.filter(({ event }) => OUTBOX_EVENT_NAMES.has(event.name));
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
