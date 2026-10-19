import { container } from "@app/di";

import { getOutboxHandlerConsumer, getOutboxHandlerEventTypes } from "./outbox-handler.decorator";
import type { OutboxEventHandler, OutboxEventHandlerRegistration } from "./port";

type OutboxHandlerClass = new (...args: any[]) => OutboxEventHandler;

/** Resolves only explicitly listed event consumers; it never registers MQ workers. */
export function registerOutboxHandlers(handlers: readonly OutboxHandlerClass[]): OutboxEventHandlerRegistration[] {
  const identities = new Set<string>();
  return handlers.flatMap((Handler) => {
    const eventTypes = getOutboxHandlerEventTypes(Handler);
    if (eventTypes.length === 0) throw new Error(`Missing @outboxHandler on ${Handler.name}`);
    const consumer = getOutboxHandlerConsumer(Handler);
    if (!consumer) throw new Error("Outbox consumer identity must not be empty");
    const handler = container.resolve<OutboxEventHandler>(Handler);
    return eventTypes.map((eventType) => {
      const key = JSON.stringify([eventType, consumer]);
      if (identities.has(key)) throw new Error(`Duplicate outbox consumer ${consumer} for ${eventType}`);
      identities.add(key);
      return { eventType, consumer, handler };
    });
  });
}
