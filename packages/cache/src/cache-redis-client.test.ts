import { once } from "node:events";
import { type AddressInfo, type Server, type Socket, createServer } from "node:net";

import type { Redis } from "@app/redis";
import { afterEach, expect, test } from "vitest";

import { createCacheRedisClient } from "./cache-redis-client";

/** Just enough RESP for the handshake (INFO ready check) and INCR. `delayMs` holds every reply back. */
function fakeRedis(delayMs = 0): Promise<{ server: Server; port: number; sockets: Set<Socket> }> {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let counter = 0;
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      // Each command is a RESP array of bulk strings: *<n>\r\n($<len>\r\n<arg>\r\n)*n
      for (;;) {
        const parsed = parseCommand(buffer);
        if (!parsed) break;
        buffer = buffer.slice(parsed.consumed);
        const name = parsed.args[0]?.toUpperCase();
        const reply =
          name === "INFO" ? bulk("# Server\r\nredis_version:7.0.0\r\nloading:0\r\n") : name === "INCR" ? `:${++counter}\r\n` : "+OK\r\n";
        setTimeout(() => socket.write(reply), delayMs);
      }
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as AddressInfo).port, sockets })),
  );
}

function bulk(value: string): string {
  return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
}

function parseCommand(input: string): { args: string[]; consumed: number } | undefined {
  const header = /^\*(\d+)\r\n/.exec(input);
  if (!header) return undefined;
  let pos = header[0].length;
  const args: string[] = [];
  for (let i = 0; i < Number(header[1]); i++) {
    const len = /^\$(\d+)\r\n/.exec(input.slice(pos));
    if (!len) return undefined;
    pos += len[0].length;
    if (input.length < pos + Number(len[1]) + 2) return undefined;
    args.push(input.slice(pos, pos + Number(len[1])));
    pos += Number(len[1]) + 2;
  }
  return { args, consumed: pos };
}

const cleanup: Array<() => Promise<unknown> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).toReversed()) await fn();
});

function track(redis: Redis, server: Server, sockets: Set<Socket>): void {
  cleanup.push(() => new Promise((resolve) => server.close(resolve)));
  cleanup.push(() => sockets.forEach((s) => s.destroy()));
  cleanup.push(() => redis.disconnect());
}

test("a command issued right after creation waits for the connection instead of being rejected", async () => {
  const { server, port, sockets } = await fakeRedis();
  const redis = createCacheRedisClient({ host: "127.0.0.1", port });
  track(redis, server, sockets);

  // Previously rejected with "Stream isn't writeable and enableOfflineQueue options is false".
  await expect(redis.incr("v")).resolves.toBe(1);
});

test("once connected, commands fail fast while Redis is unreachable", async () => {
  const { server, port, sockets } = await fakeRedis();
  const redis = createCacheRedisClient({ host: "127.0.0.1", port, retryStrategy: () => 60_000 });
  track(redis, server, sockets);
  await once(redis, "ready");

  sockets.forEach((s) => s.destroy());
  await once(redis, "close");

  const started = Date.now();
  await expect(redis.incr("v")).rejects.toThrow(/enableOfflineQueue/);
  expect(Date.now() - started).toBeLessThan(50);
});

test("a queued command is still bounded by commandTimeout while Redis is slow at boot", async () => {
  const { server, port, sockets } = await fakeRedis(1_000);
  const redis = createCacheRedisClient({ host: "127.0.0.1", port, commandTimeout: 100 });
  track(redis, server, sockets);

  await expect(redis.incr("v")).rejects.toThrow(/timed out/i);
});
