import { EventBus } from "@millstream/cqrs";
import { ForwarderPublisher } from "@millstream/forwarder";
import { PgQueuePublisher } from "@millstream/pg";

import { OUTBOX_TOPIC, transactionExecutor } from "../millstream";
import type { ITransactionManager } from "../transaction";

/** Writes inside the ambient business transaction. The message uuid is the event id (the broker's dedup key). */
export function createOutboxEventBus(transactionManager: ITransactionManager): EventBus {
  // The relay polls: LISTEN does not survive transaction-mode poolers.
  const outbox = new PgQueuePublisher(transactionExecutor(transactionManager), { notify: false });
  return new EventBus({ publisher: new ForwarderPublisher(outbox, OUTBOX_TOPIC) });
}
