import { DomainError } from "@app/core";

/** A caller/configuration invariant, not a public business failure. */
export class CacheTtlInvalidError extends DomainError<"CacheTtlInvalidError"> {
  readonly _tag = "CacheTtlInvalidError";
  readonly kind = "internal";
  constructor(readonly ttlSeconds: number) {
    super("Cache TTL must be a positive integer in seconds");
  }
}
