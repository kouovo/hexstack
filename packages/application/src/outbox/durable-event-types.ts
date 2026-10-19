import { TodoCompletedEvent } from "@app/domain";

type EventClass = { readonly type?: string; readonly name: string };

/**
 * Event types with at least one durable `@outboxHandler` consumer.
 *
 * OutboxService persists exactly these events in the producer's business transaction; every other event
 * stays a best-effort post-commit broadcast. Keep this list in step with the
 * classes registered by `registerApplicationOutboxHandlers()` (startup rejects any consumer missing from it).
 */
const DURABLE_EVENT_CLASSES: readonly EventClass[] = [TodoCompletedEvent];

export const DURABLE_EVENT_TYPES: ReadonlySet<string> = new Set(DURABLE_EVENT_CLASSES.map((event) => event.type ?? event.name));

export function isDurableEventType(eventType: string): boolean {
  return DURABLE_EVENT_TYPES.has(eventType);
}
