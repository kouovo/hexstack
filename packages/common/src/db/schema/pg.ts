import type { Table } from "drizzle-orm";
import type { Kyselify } from "drizzle-orm/kysely";
import { pgTableCreator, timestamp as pgTimestamp } from "drizzle-orm/pg-core";

import { type TABLE_PREFIX, tableName } from "./table-prefix";

/** Every application table carries the prefix; drizzle-kit only manages prefixed tables. */
export const pgTable = pgTableCreator(tableName);

export const timestamp = <TName extends string>(name: TName) => pgTimestamp(name, { withTimezone: true, mode: "date" });

/**
 * Unprefixed name → drizzle table, as the Kysely table map a repository queries. Each bounded context builds its own
 * from the tables it owns, so it cannot query another context's tables.
 */
export type KyselyTables<T extends Record<string, Table>> = {
  [K in keyof T as `${typeof TABLE_PREFIX}${K & string}`]: Kyselify<T[K]>;
};
