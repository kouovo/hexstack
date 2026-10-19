import { inject } from "@app/di";
import {
  ObjectKeyInvalidError,
  ObjectContentTypeInvalidError,
  ObjectMetadataInvalidError,
  SignedObjectUrlMethodInvalidError,
  SignedObjectUrlExpiryInvalidError,
} from "@app/domain";

// Matches Kouo's storage contract; no SDK types or product-specific file/tenant model.
export type ObjectStorageBody = string | ArrayBuffer | Blob | Uint8Array | ReadableStream<Uint8Array>;
export type ObjectStorageMetadata = Record<string, string>;
export type PutObjectInput = { key: string; body: ObjectStorageBody; contentType?: string; metadata?: ObjectStorageMetadata };
export type StoredObject = {
  key: string;
  bucket?: string;
  contentType?: string;
  etag?: string;
  metadata?: ObjectStorageMetadata;
  size?: number;
};
export type ObjectMetadata = StoredObject & { lastModified?: Date };
export type GetObjectInput = { key: string };
export type DeleteObjectInput = { key: string };
/** Consume or cancel the stream to release resources. */
export type GetObjectResp = ObjectMetadata & { body: Blob | ReadableStream<Uint8Array> };
export type SignedObjectUrlMethod = "GET" | "PUT";
export type CreateSignedObjectUrlInput = { key: string; method: SignedObjectUrlMethod; expiresInSeconds: number; contentType?: string };
/** A bearer credential: never log this URL. Temporary credentials can expire before expiresAt. */
export type SignedObjectUrl = { url: string; method: SignedObjectUrlMethod; expiresAt: Date };

/** Private storage primitives, NOT authorization. Authorize keys in a use case before calling this port. */
export interface ObjectStoragePort {
  createSignedObjectUrl(input: CreateSignedObjectUrlInput): Promise<SignedObjectUrl>;
  deleteObject(input: DeleteObjectInput): Promise<void>;
  getObject(input: GetObjectInput): Promise<GetObjectResp>;
  headObject(input: GetObjectInput): Promise<ObjectMetadata>;
  putObject(input: PutObjectInput): Promise<StoredObject>;
}

export const OBJECT_STORAGE_PORT = Symbol.for("OBJECT_STORAGE_PORT");
export const injectObjectStorage = () => inject(OBJECT_STORAGE_PORT);

/** Portable relative keys. Reject traversal/ambiguous URL paths consistently for both drivers. */
export function assertObjectKey(key: string): void {
  if (
    !key ||
    key.length > 1024 ||
    !/^[A-Za-z0-9._/-]+$/.test(key) ||
    key.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new ObjectKeyInvalidError(key);
  }
}

export function assertObjectHeaders(input: { contentType?: string; metadata?: ObjectStorageMetadata }): void {
  if (
    input.contentType !== undefined &&
    (input.contentType.length > 255 || !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:;[ -~]+)?$/.test(input.contentType))
  ) {
    throw new ObjectContentTypeInvalidError(input.contentType);
  }
  const entries = Object.entries(input.metadata ?? {});
  if (
    entries.some(
      ([key, value]) =>
        !/^[a-z0-9][a-z0-9-]*$/.test(key) ||
        /^(content-|x-amz-)/.test(key) ||
        ["cache-control", "expires", "etag", "last-modified"].includes(key) ||
        typeof value !== "string" ||
        !/^[\x20-\x7E]*$/.test(value),
    )
  )
    throw new ObjectMetadataInvalidError("invalid-entry");
  if (JSON.stringify(input.metadata ?? {}).length > 8192) throw new ObjectMetadataInvalidError("too-large");
}

export function assertSignedObjectUrlInput(input: CreateSignedObjectUrlInput): void {
  assertObjectKey(input.key);
  assertObjectHeaders(input);
  assertSignedObjectUrlOptions(input.method, input.expiresInSeconds);
}

/** Also used by CLI before resolving a provider. */
export function assertSignedObjectUrlOptions(method: string, expiresInSeconds: number): asserts method is SignedObjectUrlMethod {
  if (method !== "GET" && method !== "PUT") throw new SignedObjectUrlMethodInvalidError(method);
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 3600) {
    throw new SignedObjectUrlExpiryInvalidError(expiresInSeconds);
  }
}
