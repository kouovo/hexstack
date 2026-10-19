import { OUTBOX_EVENT_WORKER, OUTBOX_RELAY } from "@app/application";
import { container } from "@app/di";

import { OutboxEventWorkerService } from "./outbox-event-worker.service";
import { OutboxRelayService } from "./outbox-relay.service";

/** Registers outbox transport; business modules supply the worker's handlers via registerApplicationOutboxHandlers(). */
export function registerPubSub() {
  container.registerSingleton(OUTBOX_RELAY, OutboxRelayService);
  container.registerSingleton(OUTBOX_EVENT_WORKER, OutboxEventWorkerService);
}
