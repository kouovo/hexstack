import "@app/di";

const OUTBOX_HANDLER_METADATA = Symbol("OUTBOX_HANDLER_METADATA");
const OUTBOX_CONSUMER_METADATA = Symbol("OUTBOX_CONSUMER_METADATA");

/** Marks a durable event consumer. Unrelated to EventBus and MQ worker registration. */
export function outboxHandler(event: { readonly type: string }, consumer?: string): ClassDecorator {
  return (target): void => {
    if (consumer !== undefined) {
      if (!consumer.trim()) throw new Error("Outbox consumer identity must not be empty");
      const existing = Reflect.getOwnMetadata(OUTBOX_CONSUMER_METADATA, target);
      if (existing && existing !== consumer) throw new Error(`Conflicting outbox consumer identities on ${target.name}`);
      Reflect.defineMetadata(OUTBOX_CONSUMER_METADATA, consumer, target);
    }
    const eventTypes = getOutboxHandlerEventTypes(target);
    Reflect.defineMetadata(OUTBOX_HANDLER_METADATA, [...eventTypes, event.type], target);
  };
}

/** Existing class names are durable IDs; supply the original ID explicitly when renaming. */
export function getOutboxHandlerConsumer(handler: Function): string {
  return Reflect.getOwnMetadata(OUTBOX_CONSUMER_METADATA, handler) ?? handler.name;
}

export function getOutboxHandlerEventTypes(handler: object): readonly string[] {
  return Reflect.getOwnMetadata(OUTBOX_HANDLER_METADATA, handler) ?? [];
}
