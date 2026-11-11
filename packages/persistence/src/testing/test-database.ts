import { AsyncLocalStorage } from "node:async_hooks";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { createKyselyQueryBuilder, type ISqlQueryBuilder } from "../kysely";
import { TransactionManager, type TransactionScope } from "../transaction";
import { PgliteDialect } from "./pglite-dialect";

/** The same migration files production applies (`pnpm db:migrate`). */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../../../apps/api/drizzle/postgres", import.meta.url));

export interface TestDatabase {
  pglite: PGlite;
  queryBuilder: ISqlQueryBuilder;
  transactions: TransactionManager;
  close(): Promise<void>;
}

/** PGlite is single-connection: concurrent transactions cannot be tested, conditional UPDATEs are tested sequentially. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const pglite = new PGlite();
  await migrate(drizzle(pglite), { migrationsFolder: MIGRATIONS_FOLDER });
  const queryBuilder = createKyselyQueryBuilder(new PgliteDialect(pglite));
  const transactions = new TransactionManager(new AsyncLocalStorage<TransactionScope>(), queryBuilder);
  return {
    pglite,
    queryBuilder,
    transactions,
    close: async () => {
      await queryBuilder.destroy();
      await pglite.close().catch(() => undefined);
    },
  };
}
