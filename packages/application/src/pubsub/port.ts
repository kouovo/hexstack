import { type DomainEvent } from "@app/core";
import { type IEventHandler } from "@app/cqrs";
import { inject } from "@app/di";

export const OUTBOX_RELAY = Symbol.for("OUTBOX_RELAY");
export const injectOutboxRelay = () => inject(OUTBOX_RELAY);

export interface OutboxRelay {
  /** Publishes a batch of committed, unpublished rows to BullMQ. Never runs business handlers. */
  tick(): Promise<number>;
  /** Deletes rows published longer ago than the retention period. */
  cleanup(): Promise<number>;
}

export interface OutboxEventWorker {
  registerJobs(): void;
}

export const OUTBOX_EVENT_WORKER = Symbol.for("OUTBOX_EVENT_WORKER");
export const injectOutboxEventWorker = () => inject(OUTBOX_EVENT_WORKER);

export type OutboxEventHandler = IEventHandler<DomainEvent, void>;

export interface OutboxEventHandlerRegistration {
  eventType: string;
  /** Durable identity. Keep stable across deployments and handler renames. */
  consumer: string;
  handler: OutboxEventHandler;
}

export const OUTBOX_EVENT_HANDLERS = Symbol.for("OUTBOX_EVENT_HANDLERS");
export const injectOutboxEventHandlers = () => inject(OUTBOX_EVENT_HANDLERS);
