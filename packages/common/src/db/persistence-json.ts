import { sql, type RawBuilder } from "kysely";

const POSTGRES_NUL_REPLACEMENT = "\uFFFD";

export function stringifyPersistenceJson(value: unknown): string {
  return JSON.stringify(value, (_key, currentValue: unknown) =>
    typeof currentValue === "string" ? currentValue.replaceAll("\0", POSTGRES_NUL_REPLACEMENT) : currentValue,
  );
}

export function toPersistenceJson<T>(value: T | null | undefined): RawBuilder<T> | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  // Bind as text, then cast. postgres.js would otherwise JSON-encode the string again for an inferred jsonb parameter,
  // silently storing a JSON *string* instead of an object.
  return sql`${stringifyPersistenceJson(value)}::text::jsonb`;
}
