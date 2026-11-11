/** Renaming the prefix: edit it here, then `pnpm db:generate` (or edit the initial migration of a new project). */
export const TABLE_PREFIX = "app_" as const;

export type TableName<N extends string> = `${typeof TABLE_PREFIX}${N}`;

export const tableName = <N extends string>(name: N): TableName<N> => `${TABLE_PREFIX}${name}`;

/** drizzle-kit only manages tables that match this filter. */
export const TABLES_FILTER = `${TABLE_PREFIX}*`;
