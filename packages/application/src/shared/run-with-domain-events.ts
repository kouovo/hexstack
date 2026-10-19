import type { DomainEvent } from "@app/core";
import type { IEventBus } from "@app/cqrs";
import { createLogger } from "@app/logger";

import type { IOutboxService } from "../outbox";
import type { ApplicationTransactionOptions, ApplicationTransactionPort } from "../transaction";

const logger = createLogger("domain-events");

type EventCommit<T> = { result: T; events: DomainEvent[] };
type EventTransactionOptions = ApplicationTransactionOptions & { beforeCommit?: () => void };

/** The transaction boundary for business writes and their events. OutboxService selects durable consumers. */
export function commitDomainEvents<T>(
  transaction: ApplicationTransactionPort,
  outbox: IOutboxService,
  work: () => Promise<EventCommit<T>>,
  options?: EventTransactionOptions,
): Promise<EventCommit<T>> {
  const { beforeCommit, ...transactionOptions } = options ?? {};
  return transaction.run(async () => {
    const committed = await work();
    if (committed.events.length) await outbox.append(committed.events);
    beforeCommit?.();
    return committed;
  }, transactionOptions);
}

/** Broadcasts cannot undo a committed transaction or make a successful business operation fail. */
export async function publishDomainEvents(eventBus: IEventBus | undefined, events: DomainEvent[]): Promise<void> {
  if (!eventBus || !events.length) return;
  try {
    await eventBus.publishMany(events);
  } catch (error) {
    logger.warn({ err: error, eventIds: events.map((event) => event.id) }, "post-commit broadcast failed; durable outbox retained");
  }
}

export function runWithDomainEvents(
  transaction: ApplicationTransactionPort,
  outbox: IOutboxService,
  eventBus: IEventBus | undefined,
  work: () => Promise<DomainEvent[]>,
  options?: EventTransactionOptions,
): Promise<void>;
export function runWithDomainEvents<T>(
  transaction: ApplicationTransactionPort,
  outbox: IOutboxService,
  eventBus: IEventBus | undefined,
  work: () => Promise<EventCommit<T>>,
  options?: EventTransactionOptions,
): Promise<T>;
export async function runWithDomainEvents<T>(
  transaction: ApplicationTransactionPort,
  outbox: IOutboxService,
  eventBus: IEventBus | undefined,
  work: () => Promise<DomainEvent[] | EventCommit<T>>,
  options?: EventTransactionOptions,
): Promise<T | void> {
  const committed = await commitDomainEvents(
    transaction,
    outbox,
    async () => {
      const produced = await work();
      return Array.isArray(produced) ? { result: undefined, events: produced } : produced;
    },
    options,
  );
  await publishDomainEvents(eventBus, committed.events);
  return committed.result;
}
