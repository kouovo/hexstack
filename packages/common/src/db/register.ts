import { container, instanceCachingFactory } from "../di";
import { DOMAIN_EVENT_OUTBOX } from "../events/port";
import { registerApplicationTransactionPort } from "./application-transaction-adapter";
import { registerDBClient } from "./client";
import { createOutboxEventBus } from "./domain-event-outbox";
import { registerSqlQueryBuilder } from "./query-builder";
import { type ITransactionManager, registerTransactionManager, TRANSACTION_MANAGER } from "./transaction";

/** Postgres client, query builder, ambient transactions and the transactional outbox. */
export function registerDatabase() {
  registerDBClient();
  registerSqlQueryBuilder();
  registerTransactionManager();
  registerApplicationTransactionPort();
  container.register(DOMAIN_EVENT_OUTBOX, {
    useFactory: instanceCachingFactory((c) => createOutboxEventBus(c.resolve<ITransactionManager>(TRANSACTION_MANAGER))),
  });
}
