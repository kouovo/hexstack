import { DomainError } from "@app/core";

/** Startup/configuration faults, excluded from the public error catalog. */
export class StorageBucketInvalidError extends DomainError<"StorageBucketInvalidError"> {
  readonly _tag = "StorageBucketInvalidError";
  readonly kind = "internal";
  constructor(readonly bucket: string) {
    super("Storage bucket is invalid");
  }
}

export class StorageEndpointInvalidError extends DomainError<"StorageEndpointInvalidError"> {
  readonly _tag = "StorageEndpointInvalidError";
  readonly kind = "internal";
  constructor(
    readonly reason: "invalid-url" | "invalid-origin",
    options?: ErrorOptions,
  ) {
    super("Storage endpoint must be an HTTP(S) origin without credentials or a path", options);
  }
}

export class StorageTlsMismatchError extends DomainError<"StorageTlsMismatchError"> {
  readonly _tag = "StorageTlsMismatchError";
  readonly kind = "internal";
  constructor(
    readonly useSSL: boolean,
    readonly protocol: string,
  ) {
    super("STORAGE_MINIO_USE_SSL must match the storage endpoint scheme");
  }
}
