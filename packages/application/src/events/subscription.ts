import type { AnyEventDefinition, EventPayload } from "@millstream/cqrs";

/** Message-level facts about a delivered event (the payload holds the domain data). */
export interface EventMeta {
  /** Event id, fixed when the aggregate recorded it; the same on every transport. Use it for idempotency. */
  readonly id: string;
  readonly correlationId?: string;
}

/** A DI-resolved class that reacts to one event payload type. */
export interface EventHandler<TPayload> {
  handle(event: TPayload, meta: EventMeta): Promise<void> | void;
}

/** "Run `handler` for `event`", registered under a stable `name`. */
export interface EventSubscription<E extends AnyEventDefinition = AnyEventDefinition> {
  readonly event: E;
  /**
   * Unique, stable handler name. For durable subscriptions it is the consumer identity: it names the BullMQ
   * queue (`<event name>.<name>`), so keep it across renames and do not use ":".
   */
  readonly name: string;
  readonly handler: new (...args: any[]) => EventHandler<EventPayload<E>>;
}

/** Type-checked constructor: the handler must accept the event's payload. */
export function subscribe<E extends AnyEventDefinition>(
  event: E,
  name: string,
  handler: new (...args: any[]) => EventHandler<EventPayload<E>>,
): EventSubscription<E> {
  return { event, name, handler };
}
