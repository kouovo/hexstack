import { EventBus } from "@millstream/cqrs";
import { ForwarderPublisher } from "@millstream/forwarder";
import { instrumentPublisher } from "@millstream/otel";
import { PgQueuePublisher } from "@millstream/pg";

import { OUTBOX_TOPIC, transactionExecutor } from "../millstream";
import type { ITransactionManager } from "../transaction";

/** Writes inside the ambient business transaction. The message uuid is the event id (the broker's dedup key). */
export function createOutboxEventBus(transactionManager: ITransactionManager): EventBus {
  // The relay polls: LISTEN does not survive transaction-mode poolers.
  const outbox = new PgQueuePublisher(transactionExecutor(transactionManager), { notify: false });
  // Outside the forwarder: the trace context lands in the event's metadata, which the envelope (and the relay) carry
  // on, so request → outbox → relay → consumer is one trace. A no-op without an OTel SDK.
  return new EventBus({ publisher: instrumentPublisher(new ForwarderPublisher(outbox, OUTBOX_TOPIC), { system: "postgresql" }) });
}
