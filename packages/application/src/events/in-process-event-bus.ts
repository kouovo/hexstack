import { AsyncLocalStorage } from "node:async_hooks";

import { createLogger, toFieldsLogger } from "@app/logger";
import { dropOnError, MemoryPubSub, Router } from "@millstream/core";
import { EventBus, EventProcessor } from "@millstream/cqrs";

import type { EventSubscription } from "./subscription";
import { type ResolveHandler, subscriptionHandler } from "./subscription-handler";

// One shared topic: `EventBus.publishMany` publishes topic groups one after another, a single topic means one parallel batch.
const IN_PROCESS_TOPIC = "in-process-domain-events";
const topic = () => IN_PROCESS_TOPIC;

// Handlers see the async context `router.run()` started in; run it in the module-load one (no request, no transaction).
const rootContext = AsyncLocalStorage.snapshot();

export interface InProcessEventBus {
  readonly bus: EventBus;
  close(): Promise<void>;
}

/**
 * Best effort and unordered: handlers run in parallel, with each other and with themselves. `publishMany` resolves
 * once every handler is done (cache invalidation relies on it). Handlers get no request context or transaction.
 */
export function createInProcessEventBus(subscriptions: readonly EventSubscription[], resolve: ResolveHandler): InProcessEventBus {
  const logger = createLogger("in-process-events");
  const pubsub = new MemoryPubSub({ blockPublishUntilSubscriberAck: true, concurrency: Infinity });
  const router = new Router({ logger: toFieldsLogger(logger) });
  const processor = new EventProcessor({
    router,
    subscriber: pubsub,
    topic,
    middlewares: [
      dropOnError({
        onDrop: ({ error, handlerName }) => logger.error({ err: error, handler: handlerName }, "event handler failed"),
      }),
    ],
  });
  for (const subscription of subscriptions)
    processor.on(subscription.event, subscription.name, subscriptionHandler(subscription, resolve), { concurrency: Infinity });
  // Without router plugins, run() subscribes every handler synchronously: nothing published after this is missed.
  void rootContext(() => router.run()).catch((error: unknown) => logger.error({ err: error }, "in-process event router stopped"));

  return {
    bus: new EventBus({ publisher: pubsub, topic }),
    async close() {
      await router.close();
      await pubsub.close();
    },
  };
}
