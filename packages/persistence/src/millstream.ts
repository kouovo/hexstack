import type { Executor } from "@millstream/core";
import type { SqlDriver } from "@millstream/pg";
import { fromKysely, kyselyTx } from "@millstream/pg/kysely";
import type { Kysely } from "kysely";

import type { ITransactionManager } from "./transaction";

/**
 * millstream queue-type topic holding the transactional outbox: table `millstream_queue_outbox`, created by
 * migration 0003. Rows are forwarder envelopes; the relay deletes each one once the broker accepted it.
 */
export const OUTBOX_TOPIC = "outbox";

/**
 * millstream executor bound to the ambient `TransactionManager` transaction, falling back to the pool.
 * millstream's own `contextExecutor` cannot see our AsyncLocalStorage scope, so publishers created once at
 * startup use this to join whichever business transaction is running when they publish.
 */
export function transactionExecutor(transactionManager: ITransactionManager): Executor {
  return {
    query: (text, params) => kyselyTx(transactionManager.getUntypedExecutor()).query(text, params),
  };
}

/** Driver for millstream subscribers; each delivery runs in its own transaction on a pooled connection. */
export function createMillstreamDriver(db: Kysely<any>): SqlDriver {
  return fromKysely(db);
}
