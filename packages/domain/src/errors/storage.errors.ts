import { DomainError } from "@app/core";

export class ObjectKeyInvalidError extends DomainError<"ObjectKeyInvalidError"> {
  readonly _tag = "ObjectKeyInvalidError";
  readonly kind = "invalid-input";
  constructor(readonly key: string) {
    super("Object key must be a relative ASCII path without empty, dot or parent segments (max 1024 characters)");
  }
}

export class ObjectContentTypeInvalidError extends DomainError<"ObjectContentTypeInvalidError"> {
  readonly _tag = "ObjectContentTypeInvalidError";
  readonly kind = "invalid-input";
  constructor(readonly contentType: string) {
    super("Content type must be an ASCII media type without control characters");
  }
}

export class ObjectMetadataInvalidError extends DomainError<"ObjectMetadataInvalidError"> {
  readonly _tag = "ObjectMetadataInvalidError";
  readonly kind = "invalid-input";
  constructor(readonly reason: "invalid-entry" | "too-large") {
    super("Metadata must use non-reserved lowercase header-safe keys and printable ASCII values (max 8 KiB)");
  }
}

export class SignedObjectUrlMethodInvalidError extends DomainError<"SignedObjectUrlMethodInvalidError"> {
  readonly _tag = "SignedObjectUrlMethodInvalidError";
  readonly kind = "invalid-input";
  constructor(readonly method: string) {
    super("Signed URL method must be GET or PUT");
  }
}

export class SignedObjectUrlExpiryInvalidError extends DomainError<"SignedObjectUrlExpiryInvalidError"> {
  readonly _tag = "SignedObjectUrlExpiryInvalidError";
  readonly kind = "invalid-input";
  constructor(readonly expiresInSeconds: number) {
    super("Signed URL expiry must be an integer within 1..3600 seconds");
  }
}

export type StorageError =
  | ObjectKeyInvalidError
  | ObjectContentTypeInvalidError
  | ObjectMetadataInvalidError
  | SignedObjectUrlMethodInvalidError
  | SignedObjectUrlExpiryInvalidError;
