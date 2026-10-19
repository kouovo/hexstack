import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

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
  type ObjectStoragePort,
  type PutObjectInput,
  type SignedObjectUrl,
  type StoredObject,
} from "@app/application";
import { NotFoundException, NotImplementException, StorageBucketInvalidError } from "@app/domain";

export type LocalObjectStorageOptions = { bucket?: string; rootDir?: string };
type Sidecar = Pick<PutObjectInput, "contentType" | "metadata">;

/** Server-owned local files, useful for development. No public file server or filesystem URL signing. */
export class LocalObjectStorageAdapter implements ObjectStoragePort {
  private readonly rootDir: string;
  private readonly bucket: string;

  constructor(options: LocalObjectStorageOptions = {}) {
    this.bucket = options.bucket ?? "app";
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(this.bucket)) throw new StorageBucketInvalidError(this.bucket);
    this.rootDir = resolve(options.rootDir ?? ".app-storage", this.bucket);
  }

  private paths(key: string) {
    assertObjectKey(key);
    // Opaque flat names: object 'a' and 'a/b' can coexist, and key segments never become filesystem paths.
    const id = createHash("sha256").update(key).digest("hex");
    return { data: resolve(this.rootDir, "objects", id), metadata: resolve(this.rootDir, "metadata", `${id}.json`) };
  }

  async createSignedObjectUrl(input: CreateSignedObjectUrlInput): Promise<SignedObjectUrl> {
    assertSignedObjectUrlInput(input);
    throw new NotImplementException("Signed object URLs require the minio driver; local storage is not an HTTP server");
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    assertObjectHeaders(input);
    const paths = this.paths(input.key);
    await mkdir(dirname(paths.data), { recursive: true, mode: 0o700 });
    await mkdir(dirname(paths.metadata), { recursive: true, mode: 0o700 });
    const suffix = `.tmp-${randomUUID()}`;
    const temporaryData = paths.data + suffix;
    const temporaryMetadata = paths.metadata + suffix;
    try {
      let size = 0;
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          size += chunk.byteLength;
          done(null, chunk);
        },
      });
      await pipeline(await toReadable(input.body), counter, createWriteStream(temporaryData, { flags: "wx", mode: 0o600 }));
      const metadata: Sidecar = { contentType: input.contentType, metadata: input.metadata };
      await writeFile(temporaryMetadata, JSON.stringify(metadata), { flag: "wx", mode: 0o600 });
      // Individual renames are atomic; the data/sidecar pair is NOT a cross-file transaction.
      // A failed input stream never truncates the existing object. Use S3 for durable/shared storage.
      await rename(temporaryData, paths.data);
      await rename(temporaryMetadata, paths.metadata);
      return { bucket: this.bucket, key: input.key, ...metadata, size };
    } finally {
      await Promise.all([temporaryData, temporaryMetadata].map((path) => rm(path, { force: true })));
    }
  }

  async headObject(input: GetObjectInput): Promise<ObjectMetadata> {
    const paths = this.paths(input.key);
    try {
      const info = await stat(paths.data);
      let sidecar: Sidecar = {};
      try {
        sidecar = JSON.parse(await readFile(paths.metadata, "utf8")) as Sidecar;
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      return { bucket: this.bucket, key: input.key, ...sidecar, size: info.size, lastModified: info.mtime };
    } catch (error) {
      if (isMissing(error)) throw new NotFoundException("Object not found");
      throw error;
    }
  }

  async getObject(input: GetObjectInput): Promise<GetObjectResp> {
    const metadata = await this.headObject(input);
    const stream = createReadStream(this.paths(input.key).data);
    // Cancellation of the web stream destroys its Node stream too.
    return { ...metadata, body: Readable.toWeb(stream) as ReadableStream<Uint8Array> };
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    const paths = this.paths(input.key);
    await Promise.all([paths.data, paths.metadata].map((path) => rm(path, { force: true })));
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function toReadable(body: ObjectStorageBody): Promise<Readable> {
  if (body instanceof ReadableStream) return Readable.fromWeb(body);
  if (body instanceof Blob) return Readable.fromWeb(body.stream());
  if (typeof body === "string") return Readable.from([Buffer.from(body, "utf8")]);
  if (body instanceof ArrayBuffer) return Readable.from([Buffer.from(body)]);
  return Readable.from([Buffer.from(body)]);
}
