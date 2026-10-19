/** Transport-neutral classification; `_tag` remains the concrete failure's identity. */
export type ErrorKind =
  | "invalid-input"
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "locked"
  | "rate-limited"
  | "unavailable"
  | "not-implemented"
  | "internal";

/** Typed business/operational failure. Throw it; translate it only at process boundaries. */
export abstract class DomainError<Tag extends string = string> extends Error {
  abstract readonly _tag: Tag;
  /** Server-side handling category, not a public identifier or a retry policy. */
  abstract readonly kind: ErrorKind;
  /** Whether retrying a BullMQ job can help. Unknown exceptions retain BullMQ's normal retry policy. */
  readonly retryable: boolean = false;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }

  toJSON() {
    return { _tag: this._tag, message: this.message };
  }
}
