import { createHash, randomUUID } from "node:crypto";

import { LockContentionError } from "../../errors/common.errors";
import { createLogger } from "../../logger";
import type { Redis } from "../../redis/client";
import type { LockLease, LockPort, LockSignal } from "../lock.port";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

/** Equal jitter: half fixed, half random, so waiters that arrived together do not retry in lockstep. */
const jittered = (ms: number) => ms / 2 + Math.random() * (ms / 2);

/** FIFO per-resource mutex for one process (`CACHE_DRIVER=memory`, tests). The TTL is ignored: it never expires. */
export class InMemoryLockAdapter implements LockPort {
  /** Present = held; the value is the queue of `using` waiters. */
  private readonly held = new Map<string, Array<() => void>>();

  async using<T>(resource: string, _ttlMs: number, fn: (signal: LockSignal) => Promise<T>): Promise<T> {
    await this.acquire(resource);
    try {
      return await fn(new AbortController().signal as LockSignal);
    } finally {
      this.release(resource);
    }
  }

  async tryAcquire(resource: string, _ttlMs: number): Promise<LockLease | undefined> {
    if (this.held.has(resource)) return undefined;
    this.held.set(resource, []);
    let released = false;
    return {
      release: async () => {
        if (released) return;
        released = true;
        this.release(resource);
      },
    };
  }

  private acquire(resource: string): Promise<void> {
    return new Promise((resolve) => {
      const waiters = this.held.get(resource);
      if (waiters === undefined) {
        this.held.set(resource, []);
        resolve();
      } else {
        waiters.push(resolve);
      }
    });
  }

  /** Hands the lock straight to the next waiter, or frees it. */
  private release(resource: string): void {
    const next = this.held.get(resource)?.shift();
    if (next) {
      next();
    } else {
      this.held.delete(resource);
    }
  }
}

/** A Lua script run by EVALSHA, falling back to EVAL once if Redis has not cached it yet (NOSCRIPT). */
class LuaScript {
  private readonly sha: string;

  constructor(private readonly source: string) {
    this.sha = createHash("sha1").update(source).digest("hex");
  }

  async run(redis: Redis, keys: string[], args: Array<string | number>): Promise<unknown> {
    try {
      return await redis.evalsha(this.sha, keys.length, ...keys, ...args);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("NOSCRIPT")) {
        return redis.eval(this.source, keys.length, ...keys, ...args);
      }
      throw err;
    }
  }
}

/** Delete / extend only while the key still holds our token: never touch another holder's lease. */
const RELEASE = new LuaScript(`if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end
return 0`);
const EXTEND = new LuaScript(`if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("PEXPIRE", KEYS[1], ARGV[2]) end
return 0`);

export interface RedisLockOptions {
  /** How long `using` waits for a held lock before `LockContentionError`. Default 2000 ms. */
  waitTimeoutMs?: number;
  /** First retry delay of `using`; doubles (with jitter) up to `maxRetryDelayMs`. Default 50 ms. */
  retryDelayMs?: number;
  /** Default 500 ms. */
  maxRetryDelayMs?: number;
}

/**
 * Single-node Redis lock: `SET key token NX PX ttl`, token-checked release and extension in Lua.
 *
 * `using` retries with exponential backoff and jitter until `waitTimeoutMs`, then auto-extends the lease every
 * `ttl / 3` while `fn` runs. A failed extension (key gone, or errors past the lease's validity) aborts the signal.
 * Store errors during acquisition propagate at once; release failures are logged (the lease expires by TTL).
 */
export class RedisLockAdapter implements LockPort {
  private readonly logger = createLogger(RedisLockAdapter.name);
  private readonly waitTimeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly maxRetryDelayMs: number;

  constructor(
    private readonly redis: Redis,
    options: RedisLockOptions = {},
  ) {
    this.waitTimeoutMs = options.waitTimeoutMs ?? 2_000;
    this.retryDelayMs = options.retryDelayMs ?? 50;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 500;
  }

  async using<T>(resource: string, ttlMs: number, fn: (signal: LockSignal) => Promise<T>): Promise<T> {
    const token = await this.acquire(resource, ttlMs);
    const lease = this.keepAlive(resource, token, ttlMs);
    try {
      return await fn(lease.signal);
    } finally {
      await lease.stop();
      await this.release(resource, token);
    }
  }

  async tryAcquire(resource: string, ttlMs: number): Promise<LockLease | undefined> {
    const token = randomUUID();
    if (!(await this.trySet(resource, token, ttlMs))) return undefined;
    return { release: () => this.release(resource, token) };
  }

  private async trySet(resource: string, token: string, ttlMs: number): Promise<boolean> {
    return (await this.redis.set(resource, token, "PX", ttlMs, "NX")) === "OK";
  }

  private async acquire(resource: string, ttlMs: number): Promise<string> {
    const token = randomUUID();
    const deadline = Date.now() + this.waitTimeoutMs;
    let delay = this.retryDelayMs;
    for (let attempt = 1; ; attempt++) {
      // Store errors propagate from here: an outage is not contention and must not burn the wait budget.
      if (await this.trySet(resource, token, ttlMs)) return token;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        this.logger.debug({ resource, attempts: attempt }, "lock not acquired");
        throw new LockContentionError(resource, ttlMs);
      }
      await sleep(Math.min(remaining, jittered(delay)));
      delay = Math.min(delay * 2, this.maxRetryDelayMs);
    }
  }

  private keepAlive(resource: string, token: string, ttlMs: number): { signal: LockSignal; stop: () => Promise<void> } {
    const controller = new AbortController();
    let error: Error | undefined;
    const signal = controller.signal as LockSignal;
    Object.defineProperty(signal, "error", { get: () => error, enumerable: true });

    const interval = Math.max(1, Math.floor(ttlMs / 3));
    // Measured after SET returned, so slightly optimistic; the ttl/3 cadence leaves ample margin.
    let validUntil = Date.now() + ttlMs;
    let stopped = false;
    let timer: NodeJS.Timeout | undefined;
    let inflight: Promise<void> | undefined;

    const lose = (err: Error) => {
      if (stopped) return;
      error = err;
      this.logger.warn({ resource, errorType: err.name }, "lock lease lost");
      controller.abort(err);
    };

    const tick = async () => {
      const sentAt = Date.now();
      try {
        const extended = await EXTEND.run(this.redis, [resource], [token, ttlMs]);
        if (extended !== 1) return lose(new Error(`Lock lease lost: ${resource}`));
        validUntil = sentAt + ttlMs;
      } catch (err) {
        // Transient errors are retried while the lease is still valid; past that, assume it is gone.
        if (Date.now() + interval >= validUntil) return lose(toError(err));
      }
      schedule();
    };

    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(() => {
        inflight = tick();
      }, interval);
      timer.unref();
    };

    schedule();
    return {
      signal,
      stop: async () => {
        stopped = true;
        clearTimeout(timer);
        await inflight;
      },
    };
  }

  private async release(resource: string, token: string): Promise<void> {
    try {
      await RELEASE.run(this.redis, [resource], [token]);
    } catch (err) {
      this.logger.warn({ resource, errorType: toError(err).name }, "lock release failed; lease expires by TTL");
    }
  }
}
