import { container, instanceCachingFactory } from "@app/di";

import { isDurableEventType } from "./outbox/durable-event-types";
import { OUTBOX_EVENT_HANDLERS, type OutboxEventHandlerRegistration } from "./pubsub/port";
import { registerOutboxHandlers } from "./pubsub/register-outbox-handlers";
import { DispatchTodoCompletedOutboxHandler } from "./todo/todo-outbox-handlers";

/** Durable event consumers only. Does not discover or register any MQ workers. */
export function registerApplicationOutboxHandlers(): void {
  container.register(OUTBOX_EVENT_HANDLERS, {
    useFactory: instanceCachingFactory((): OutboxEventHandlerRegistration[] => assertDurablyProduced([DispatchTodoCompletedOutboxHandler])),
  });
}

/** A consumer whose event is not persisted by producers would silently never run. */
function assertDurablyProduced(handlers: Parameters<typeof registerOutboxHandlers>[0]): OutboxEventHandlerRegistration[] {
  const registrations = registerOutboxHandlers(handlers);
  const missing = [...new Set(registrations.map(({ eventType }) => eventType).filter((eventType) => !isDurableEventType(eventType)))];
  if (missing.length > 0) throw new Error(`Outbox consumers registered for non-durable event types: ${missing.join(", ")}`);
  return registrations;
}
