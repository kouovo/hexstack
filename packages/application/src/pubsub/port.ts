import { inject } from "@app/di";

/** Retries, backoff and failed-message retention belong to the broker. */
export interface DomainEventPipeline {
  /** Starts consuming; resolves once every handler has subscribed. */
  start(): Promise<void>;
  /** Stops pulling, waits for in-flight messages, then releases connections. */
  close(): Promise<void>;
}

export const DOMAIN_EVENT_PIPELINE = Symbol.for("DOMAIN_EVENT_PIPELINE");
export const injectDomainEventPipeline = () => inject(DOMAIN_EVENT_PIPELINE);
