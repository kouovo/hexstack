import { createLogger, toFieldsLogger } from "@app/logger";
import { dropOnError, MemoryPubSub, Router } from "@millstream/core";
import { EventBus, EventProcessor, type EventItem } from "@millstream/cqrs";

import type { DomainEventPublisher } from "./port";
import type { EventSubscription } from "./subscription";
import { type ResolveHandler, subscriptionHandler } from "./subscription-handler";

/**
 * In-process, best-effort delivery on millstream: `EventBus` → `MemoryPubSub` → `EventProcessor` (+ `dropOnError`).
 *
 * `publishMany` resolves once every subscribed handler has handled the events (payloads are validated and
 * coerced by the event schemas, so handlers get real Dates). A failing handler is logged and dropped, never
 * retried. The router starts on the first publish, so any process (API, CLI, tests) can publish.
 */
export class InProcessEventBus implements DomainEventPublisher {
  private readonly logger = createLogger("in-process-events");
  private readonly pubsub = new MemoryPubSub({ blockPublishUntilSubscriberAck: true });
  private readonly bus = new EventBus({ publisher: this.pubsub });
  private readonly router = new Router({ logger: toFieldsLogger(this.logger) });
  private state: "idle" | "running" | "closed" = "idle";

  constructor(subscriptions: readonly EventSubscription[], resolve: ResolveHandler) {
    const processor = new EventProcessor({
      router: this.router,
      subscriber: this.pubsub,
      middlewares: [
        dropOnError({
          onDrop: ({ error, handlerName }) => this.logger.error({ err: error, handler: handlerName }, "event handler failed"),
        }),
      ],
    });
    for (const subscription of subscriptions)
      processor.on(subscription.event, subscription.name, subscriptionHandler(subscription, resolve));
  }

  async publishMany(events: readonly EventItem[]): Promise<unknown> {
    if (this.state === "closed") return [];
    if (this.state === "idle") {
      this.state = "running";
      void this.router.run().catch((error: unknown) => this.logger.error({ err: error }, "in-process event router stopped"));
    }
    return this.bus.publishMany(events);
  }

  /** In-flight handlers finish (up to the router's close timeout); later publishes are no-ops. */
  async close(): Promise<void> {
    this.state = "closed";
    await this.router.close();
    await this.pubsub.close();
  }
}
