import { CORRELATION_ID, type Message } from "@millstream/core";

import type { EventHandler, EventSubscription } from "./subscription";

export type ResolveHandler = <T>(handler: new (...args: any[]) => T) => T;

export function subscriptionHandler(subscription: EventSubscription, resolve: ResolveHandler) {
  return (payload: unknown, msg: Message) =>
    resolve<EventHandler<unknown>>(subscription.handler).handle(payload, { id: msg.uuid, correlationId: msg.metadata[CORRELATION_ID] });
}
