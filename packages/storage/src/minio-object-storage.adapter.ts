import { Readable } from "node:stream";

import {
  assertObjectHeaders,
  assertObjectKey,
  assertSignedObjectUrlInput,
  type CreateSignedObjectUrlInput,
  type DeleteObjectInput,
  type GetObjectInput,
  type GetObjectResp,
  type ObjectMetadata,
  type ObjectStorageBody,
  type ObjectStorageMetadata,
  type ObjectStoragePort,
  type PutObjectInput,
  type SignedObjectUrl,
  type StoredObject,
} from "@app/application";
import { InternalServerErrorException, NotFoundException, StorageEndpointInvalidError, StorageTlsMismatchError } from "@app/domain";
import { Client } from "minio";

export type MinioObjectStorageOptions = {
  accessKey: string;
  bucket: string;
  endPoint: string;
  secretKey: string;
  port?: number;
  region?: string;
  useSSL?: boolean;
};
type StorageClient = Pick<Client, "presignedGetObject" | "presignedPutObject" | "removeObject" | "getObject" | "statObject" | "putObject">;

/** Same driver/API as Kouo. The MinIO SDK also works with other compatible private S3 endpoints. */
export class MinioObjectStorageAdapter implements ObjectStoragePort {
  private readonly client: StorageClient;
  private readonly bucket: string;

  constructor(options: MinioObjectStorageOptions, client?: StorageClient) {
    this.bucket = options.bucket;
    let url: URL;
    try {
      url = new URL(options.endPoint.includes("://") ? options.endPoint : `${options.useSSL ? "https" : "http"}://${options.endPoint}`);
    } catch (cause) {
      throw new StorageEndpointInvalidError("invalid-url", { cause });
    }
    if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/" || url.username || url.password || url.search || url.hash) {
      throw new StorageEndpointInvalidError("invalid-origin");
    }
    if (options.useSSL !== undefined && options.useSSL !== (url.protocol === "https:")) {
      throw new StorageTlsMismatchError(options.useSSL, url.protocol);
    }
    this.client =
      client ??
      new Client({
        endPoint: url.hostname,
        port: options.port ?? (url.port ? Number(url.port) : undefined),
        accessKey: options.accessKey,
        secretKey: options.secretKey,
        region: options.region,
        useSSL: url.protocol === "https:",
      });
  }

  async createSignedObjectUrl(input: CreateSignedObjectUrlInput): Promise<SignedObjectUrl> {
    assertSignedObjectUrlInput(input);
    try {
      const url =
        input.method === "GET"
          ? await this.client.presignedGetObject(this.bucket, input.key, input.expiresInSeconds, {
              "response-content-disposition": "attachment",
            })
          : await this.client.presignedPutObject(this.bucket, input.key, input.expiresInSeconds);
      // These are bearer URLs. PUT signing does not enforce contentType, size or one-time use.
      return { method: input.method, url, expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000) };
    } catch (error) {
      throw failure("Failed to sign object URL", error);
    }
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    assertObjectKey(input.key);
    assertObjectHeaders(input);
    try {
      const { body, size } = toPutBody(input.body);
      const headers = {
        ...Object.fromEntries(Object.entries(input.metadata ?? {}).map(([key, value]) => [`X-Amz-Meta-${key}`, value])),
        ...(input.contentType ? { "Content-Type": input.contentType } : {}),
      };
      const result = await this.client.putObject(this.bucket, input.key, body, size, headers);
      return { key: input.key, bucket: this.bucket, contentType: input.contentType, metadata: input.metadata, etag: result.etag, size };
    } catch (error) {
      throw failure("Failed to put object", error);
    }
  }

  async headObject(input: GetObjectInput): Promise<ObjectMetadata> {
    assertObjectKey(input.key);
    try {
      const info = await this.client.statObject(this.bucket, input.key);
      const headers = Object.fromEntries(Object.entries(info.metaData).map(([key, value]) => [key.toLowerCase(), String(value)]));
      const metadata: ObjectStorageMetadata = {};
      for (const [key, value] of Object.entries(headers)) {
        if (key.startsWith("x-amz-meta-")) metadata[key.slice(11)] = value;
        else if (
          key !== "content-type" &&
          key !== "cache-control" &&
          key !== "content-disposition" &&
          key !== "content-encoding" &&
          key !== "content-language" &&
          key !== "expires"
        )
          metadata[key] = value;
      }
      return {
        key: input.key,
        bucket: this.bucket,
        contentType: headers["content-type"],
        metadata,
        etag: info.etag,
        size: info.size,
        lastModified: info.lastModified,
      };
    } catch (error) {
      if (isMissing(error)) throw new NotFoundException("Object not found");
      throw failure("Failed to read object metadata", error);
    }
  }

  async getObject(input: GetObjectInput): Promise<GetObjectResp> {
    const metadata = await this.headObject(input);
    try {
      const stream = await this.client.getObject(this.bucket, input.key);
      return { ...metadata, body: Readable.toWeb(stream) as ReadableStream<Uint8Array> };
    } catch (error) {
      if (isMissing(error)) throw new NotFoundException("Object not found");
      throw failure("Failed to get object", error);
    }
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    assertObjectKey(input.key);
    try {
      await this.client.removeObject(this.bucket, input.key);
    } catch (error) {
      throw failure("Failed to delete object", error);
    }
  }
}

function toPutBody(body: ObjectStorageBody): { body: Buffer | string | Readable; size?: number } {
  if (typeof body === "string") return { body, size: Buffer.byteLength(body) };
  if (body instanceof Uint8Array) return { body: Buffer.from(body), size: body.byteLength };
  if (body instanceof ArrayBuffer) return { body: Buffer.from(body), size: body.byteLength };
  if (body instanceof Blob) return { body: Readable.fromWeb(body.stream()), size: body.size };
  return { body: Readable.fromWeb(body) };
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "NoSuchKey" || error.code === "NotFound");
}

function failure(message: string, cause: unknown): InternalServerErrorException {
  // Do not expose backend addresses, credentials or raw provider messages to callers.
  return new InternalServerErrorException(message, cause instanceof Error ? cause : undefined);
}
