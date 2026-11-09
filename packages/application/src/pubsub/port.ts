import { inject } from "@app/di";

/**
 * Durable event delivery for a long-running process: relays committed outbox entries to the broker and
 * runs every durable subscription. Retries, backoff and failed-message retention belong to the broker.
 */
export interface DomainEventPipeline {
  /** Starts consuming; resolves once every handler has subscribed. */
  start(): Promise<void>;
  /** Stops pulling, waits for in-flight messages, then releases connections. */
  close(): Promise<void>;
}

export const DOMAIN_EVENT_PIPELINE = Symbol.for("DOMAIN_EVENT_PIPELINE");
export const injectDomainEventPipeline = () => inject(DOMAIN_EVENT_PIPELINE);
