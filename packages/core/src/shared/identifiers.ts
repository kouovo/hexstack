import { ValueObject } from "./value-object";

/** The caller owns the domain error; core never imports domain definitions. */
export function createIdentifierValue<TIdentifier extends IdentifierValue>(
  value: string,
  label: string,
  create: (normalized: string) => TIdentifier,
  onEmpty: (label: string) => Error,
): TIdentifier {
  const normalized = value.trim();
  if (!normalized) throw onEmpty(label);
  return create(normalized);
}

export abstract class IdentifierValue extends ValueObject<string> {
  protected constructor(value: string) {
    super(value);
  }

  get value(): string {
    return this.state;
  }
  override toString(): string {
    return this.state;
  }
  toJSON(): string {
    return this.state;
  }
}
