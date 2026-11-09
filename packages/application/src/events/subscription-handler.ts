import { CORRELATION_ID, type Message } from "@millstream/core";

import type { EventHandler, EventSubscription } from "./subscription";

/** Resolves a subscription's handler class (the DI container in production). */
export type ResolveHandler = <T>(handler: new (...args: any[]) => T) => T;

/** Adapts a subscription to a millstream `EventProcessor` handler: resolve the class, pass payload + meta. */
export function subscriptionHandler(subscription: EventSubscription, resolve: ResolveHandler) {
  return (payload: unknown, msg: Message) =>
    resolve<EventHandler<unknown>>(subscription.handler).handle(payload, { id: msg.uuid, correlationId: msg.metadata[CORRELATION_ID] });
}
