import { z } from "@app/zod";
import { parseEvent } from "@millstream/cqrs";

import type { JobDispatcher } from "../queue/queue.port";
import type { EventHandler, EventSubscription } from "./subscription";
import type { ResolveHandler } from "./subscription-handler";

/** What the relay enqueues per (event, subscription): the raw event payload plus what becomes `EventMeta`. */
export const outboxJobDataSchema = z.object({
  eventId: z.string(),
  correlationId: z.string().optional(),
  payload: z.unknown(),
});

export type OutboxJobData = z.infer<typeof outboxJobDataSchema>;

/** One BullMQ worker per subscription, on the queue named after it. The payload is parsed with the event's schema. */
export function registerOutboxWorkers(
  subscriptions: readonly EventSubscription[],
  dispatcher: JobDispatcher,
  resolve: ResolveHandler,
): void {
  const names = new Set<string>();
  for (const { event, name, handler } of subscriptions) {
    if (names.has(name)) throw new Error(`Outbox subscription already registered: ${name}`);
    names.add(name);
    const instance = resolve<EventHandler<unknown>>(handler);
    dispatcher.registerJob(name, async (data) => {
      const { eventId, correlationId, payload } = outboxJobDataSchema.parse(data);
      await instance.handle(await parseEvent(event, payload), { id: eventId, correlationId });
    });
  }
}
