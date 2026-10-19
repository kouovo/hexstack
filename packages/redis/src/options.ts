import { env } from "@app/env";
import type { RedisOptions } from "ioredis";

/** Read lazily: importing this package must not fail just because REDIS_URL is unset (tests, type-only users). */
export function getRedisUrl(): string {
  const url = env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set. It is required for the BullMQ queue, the outbox relay schedule and rate limiting.");
  }
  return url;
}

export function getRedisOptions(): RedisOptions {
  return parseRedisUrl(getRedisUrl());
}

function parseRedisUrl(url: string): RedisOptions {
  const u = new URL(url);
  const dbRaw = u.pathname.length > 1 ? u.pathname.slice(1) : "0";
  const db = Number(dbRaw);
  const opts: RedisOptions = {
    host: u.hostname || undefined,
    port: u.port ? Number(u.port) : 6379,
    db: Number.isNaN(db) ? 0 : db,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
  };
  if (u.protocol === "rediss:") {
    opts.tls = {};
  }
  return opts;
}
