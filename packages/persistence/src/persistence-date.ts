export function toPersistenceDate(value: Date | string | null | undefined): any {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function toNullablePersistenceDate(value: Date | string | null | undefined): any {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return toPersistenceDate(value);
}

export function fromPersistenceDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function fromNullablePersistenceDate(value: Date | string | null | undefined): Date | undefined {
  if (value === undefined || value === null) return undefined;

  return fromPersistenceDate(value);
}
