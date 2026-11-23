import type { Executor } from "@millstream/core";
import type { SqlDriver } from "@millstream/pg";
import { fromKysely, kyselyTx } from "@millstream/pg/kysely";
import type { Kysely } from "kysely";

import type { ITransactionManager } from "./transaction";

/** Table `millstream_queue_outbox` (migration 0003). */
export const OUTBOX_TOPIC = "outbox";

/** millstream's `contextExecutor` cannot see our AsyncLocalStorage transaction; this one joins it (else the pool). */
export function transactionExecutor(transactionManager: ITransactionManager): Executor {
  return {
    query: (text, params) => kyselyTx(transactionManager.getUntypedExecutor()).query(text, params),
  };
}

/** Each delivery runs in its own transaction on a pooled connection. */
export function createMillstreamDriver(db: Kysely<any>): SqlDriver {
  return fromKysely(db);
}
