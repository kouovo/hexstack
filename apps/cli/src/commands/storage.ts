import { randomUUID } from "node:crypto";
import { createWriteStream, openAsBlob } from "node:fs";
import { link, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { assertSignedObjectUrlOptions } from "@app/application";
import { Command, Option } from "clipanion";

import { AppCommand } from "../base-command";
import { loadObjectStorage } from "../storage";

export class StoragePutCliCommand extends AppCommand {
  static override paths = [["storage", "put"]];
  static override usage = Command.Usage({ description: "Upload a local file (trusted operator access)" });
  file = Option.String({ name: "file" });
  key = Option.String({ name: "key" });
  contentType = Option.String("--content-type", "application/octet-stream");
  async execute(): Promise<number> {
    const storage = await loadObjectStorage();
    const body = await openAsBlob(resolve(this.file)); // streams from disk, does not read the file into RAM
    this.write(await storage.putObject({ key: this.key, body, contentType: this.contentType }));
    return 0;
  }
}

export class StorageGetCliCommand extends AppCommand {
  static override paths = [["storage", "get"]];
  static override usage = Command.Usage({ description: "Download an object to a new file; refuses to overwrite an existing destination" });
  key = Option.String({ name: "key" });
  file = Option.String({ name: "file" });
  async execute(): Promise<number> {
    const storage = await loadObjectStorage();
    const { body, ...metadata } = await storage.getObject({ key: this.key });
    const source = Readable.fromWeb(body instanceof Blob ? body.stream() : body);
    const destination = resolve(this.file);
    const temporary = `${destination}.tmp-${randomUUID()}`;
    try {
      await mkdir(dirname(destination), { recursive: true });
      await pipeline(source, createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
      // Atomic, exclusive publication: failed downloads never leave partial destination files.
      await link(temporary, destination);
      this.write(metadata);
    } finally {
      source.destroy();
      await rm(temporary, { force: true });
    }
    return 0;
  }
}

export class StorageHeadCliCommand extends AppCommand {
  static override paths = [["storage", "head"]];
  static override usage = Command.Usage({ description: "Inspect object metadata" });
  key = Option.String({ name: "key" });
  async execute(): Promise<number> {
    this.write(await (await loadObjectStorage()).headObject({ key: this.key }));
    return 0;
  }
}

export class StorageDeleteCliCommand extends AppCommand {
  static override paths = [["storage", "delete"]];
  static override usage = Command.Usage({ description: "Delete an object (idempotent)" });
  key = Option.String({ name: "key" });
  async execute(): Promise<number> {
    await (await loadObjectStorage()).deleteObject({ key: this.key });
    this.write({ ok: true });
    return 0;
  }
}

export class StorageSignCliCommand extends AppCommand {
  static override paths = [["storage", "sign"]];
  static override usage = Command.Usage({
    description: "Issue a short-lived GET/PUT bearer URL (minio driver only); handle output as a secret",
  });
  key = Option.String({ name: "key" });
  method = Option.String("--method", "GET");
  expiresIn = Option.String("--expires-in", "900");
  async execute(): Promise<number> {
    const method = this.method;
    const expiresInSeconds = Number(this.expiresIn);
    assertSignedObjectUrlOptions(method, expiresInSeconds);
    this.write(await (await loadObjectStorage()).createSignedObjectUrl({ key: this.key, method, expiresInSeconds }));
    return 0;
  }
}

export const storageCliCommands = [
  StoragePutCliCommand,
  StorageGetCliCommand,
  StorageHeadCliCommand,
  StorageDeleteCliCommand,
  StorageSignCliCommand,
];
