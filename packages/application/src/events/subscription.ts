import type { AnyEventDefinition, EventPayload } from "@millstream/cqrs";

export interface EventMeta {
  /** Fixed when the aggregate recorded it, the same on every transport: use it for idempotency. */
  readonly id: string;
  readonly correlationId?: string;
}

export interface EventHandler<TPayload> {
  handle(event: TPayload, meta: EventMeta): Promise<void> | void;
}

export interface EventSubscription<E extends AnyEventDefinition = AnyEventDefinition> {
  readonly event: E;
  /** Durable subscriptions: names the BullMQ queue (`<event name>.<name>`), so keep it stable and without ":". */
  readonly name: string;
  readonly handler: new (...args: any[]) => EventHandler<EventPayload<E>>;
}

export function subscribe<E extends AnyEventDefinition>(
  event: E,
  name: string,
  handler: new (...args: any[]) => EventHandler<EventPayload<E>>,
): EventSubscription<E> {
  return { event, name, handler };
}
