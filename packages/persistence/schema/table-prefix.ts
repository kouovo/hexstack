/**
 * The ONE place that names this project's tables.
 *
 * Every table is created through `pgTable` below and addressed through `tableName()`, so renaming the
 * prefix is a single edit here followed by `pnpm db:generate` (or editing the initial migration for a new project).
 */
export const TABLE_PREFIX = "app_" as const;

export type TableName<N extends string> = `${typeof TABLE_PREFIX}${N}`;

export const tableName = <N extends string>(name: N): TableName<N> => `${TABLE_PREFIX}${name}`;

/** drizzle-kit only manages tables that match this filter. */
export const TABLES_FILTER = `${TABLE_PREFIX}*`;
