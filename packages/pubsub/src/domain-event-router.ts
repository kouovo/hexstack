import { type EventSubscription, type ResolveHandler, subscriptionHandler } from "@app/application";
import type { Middleware, Publisher, Router, Subscriber } from "@millstream/core";
import { EventProcessor } from "@millstream/cqrs";
import { addForwarder } from "@millstream/forwarder";

/** Router handler name of the outbox relay. */
export const OUTBOX_RELAY_HANDLER = "outbox-relay";

export interface DomainEventRouterOptions {
  /** Reads the committed outbox (forwarder envelopes). */
  outbox: { subscriber: Subscriber; topic: string };
  /** Broker the relay publishes to. Must deliver each event to every subscription listed for it. */
  broker: Publisher;
  subscriptions: readonly EventSubscription[];
  /** Broker subscription of one durable subscription; `handlerName` is the subscription name (the consumer group). */
  consumerSubscriber: (p: { handlerName: string; topic: string }) => Subscriber;
  /** Applied to every consumer handler (inside the router-level middlewares). */
  consumerMiddlewares?: Middleware[];
  resolve: ResolveHandler;
}

/**
 * Wires the durable event flow onto `router`:
 * outbox (committed in the business transaction) → relay → broker → millstream EventProcessor → handlers.
 * Transport-agnostic so it can be exercised with in-memory Pub/Sub.
 */
export function addDomainEventHandlers(router: Router, opts: DomainEventRouterOptions): void {
  const subscribed = new Set(opts.subscriptions.map(({ event }) => event.name));

  addForwarder(router, {
    handlerName: OUTBOX_RELAY_HANDLER,
    forwarderTopic: opts.outbox.topic,
    subscriber: opts.outbox.subscriber,
    publisher: {
      publish: async (topic, ...messages) => {
        // Fail visibly on deployment mismatches (an event written by a newer version): the entry stays in the
        // outbox and is retried until a process that knows its subscriptions relays it. Never drop it silently.
        if (!subscribed.has(topic)) throw new Error(`No durable subscription for ${topic}`);
        await opts.broker.publish(topic, ...messages);
      },
      close: () => opts.broker.close(),
    },
    // A row that is not an envelope can never be relayed; it would otherwise block the outbox forever.
    ackWhenCannotUnwrap: true,
  });

  // Invalid payloads become PermanentErrors inside the processor (never retried).
  const processor = new EventProcessor({ router, subscriber: opts.consumerSubscriber, middlewares: opts.consumerMiddlewares });
  for (const subscription of opts.subscriptions) {
    processor.on(subscription.event, subscription.name, subscriptionHandler(subscription, opts.resolve));
  }
}
