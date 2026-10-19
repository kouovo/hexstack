import { inject } from "@app/di";

/** Durable event data, written in the owning business transaction. */
export interface OutboxEntry {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  correlationId: string | null;
}

/** Unpublished record. Delivery state belongs to BullMQ after publication. */
export interface OutboxMessage extends OutboxEntry {
  seq: number;
  createdAt: Date;
}

export const DOMAIN_EVENT_JOB_NAME = "domain-event";

/** One independently retried delivery per event/consumer pair. */
export interface OutboxConsumerJob {
  entry: OutboxMessage;
  consumer: string;
}

export function outboxConsumerJobId(id: string, consumer: string): string {
  return `${id}__${consumer}`;
}

export interface IOutboxRepository {
  insert(entry: OutboxEntry): Promise<void>;
  /** Holds row locks through publish and acknowledgement; failures roll back the batch. */
  publishPending(limit: number, publish: (entry: OutboxMessage) => Promise<void>): Promise<number>;
  deletePublishedBefore(cutoff: Date, limit: number): Promise<number>;
}

export const OUTBOX_REPO = Symbol.for("OUTBOX_REPO");
export const injectOutboxRepo = () => inject(OUTBOX_REPO);
