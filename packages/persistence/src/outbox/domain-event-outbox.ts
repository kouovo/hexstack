import { EventBus } from "@millstream/cqrs";
import { ForwarderPublisher } from "@millstream/forwarder";
import { PgQueuePublisher } from "@millstream/pg";

import { OUTBOX_TOPIC, transactionExecutor } from "../millstream";
import type { ITransactionManager } from "../transaction";

/**
 * The transactional outbox as a millstream `EventBus`: each event becomes a forwarder envelope in
 * `millstream_queue_<OUTBOX_TOPIC>`, written inside the ambient business transaction. The envelope's destination
 * topic is the event name; the message uuid is the event id (the broker's dedup key).
 */
export function createOutboxEventBus(transactionManager: ITransactionManager): EventBus {
  // notify: false, because the relay polls instead of LISTENing (LISTEN does not survive transaction-mode poolers).
  const outbox = new PgQueuePublisher(transactionExecutor(transactionManager), { notify: false });
  return new EventBus({ publisher: new ForwarderPublisher(outbox, OUTBOX_TOPIC) });
}
