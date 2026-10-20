import type { LockPort, LockSignal } from "@app/application";
import { LockContentionError } from "@app/domain";
import { createLogger } from "@app/logger";
import type { Redis } from "@app/redis";
import { createLock, IoredisAdapter, LockAcquisitionError } from "redlock-universal";

/** FIFO per-resource mutex for one process (`CACHE_DRIVER=memory`, tests). The TTL is ignored: it never expires. */
export class InMemoryLockAdapter implements LockPort {
  private readonly queues = new Map<string, Array<() => void>>();

  async using<T>(resource: string, _ttlMs: number, fn: (signal: LockSignal) => Promise<T>): Promise<T> {
    await this.acquire(resource);
    try {
      return await fn(new AbortController().signal as LockSignal);
    } finally {
      this.release(resource);
    }
  }

  private acquire(resource: string): Promise<void> {
    return new Promise((resolve) => {
      const queue = this.queues.get(resource);
      if (queue === undefined) {
        this.queues.set(resource, []);
        resolve();
      } else {
        queue.push(resolve);
      }
    });
  }

  private release(resource: string): void {
    const queue = this.queues.get(resource);
    const next = queue?.shift();
    if (next) {
      next();
    } else {
      this.queues.delete(resource);
    }
  }
}

/**
 * Single-node Redis lock (redlock-universal `SimpleLock`: `SET NX PX` + Lua release/extend).
 * `using` auto-extends the lease while `fn` runs and aborts the signal (with `.error`) if an extension fails;
 * `fn`'s own errors propagate unchanged and release failures are swallowed (the lease then expires by TTL).
 * Exhausted acquisition retries, whether from contention or a Redis outage, become `LockContentionError`
 * (kind `locked`, retryable). The underlying cause is logged, never exposed.
 */
export class RedisLockAdapter implements LockPort {
  private readonly logger = createLogger(RedisLockAdapter.name);
  private readonly adapter: IoredisAdapter;

  constructor(redis: Redis) {
    this.adapter = new IoredisAdapter(redis);
  }

  async using<T>(resource: string, ttlMs: number, fn: (signal: LockSignal) => Promise<T>): Promise<T> {
    // Lock objects are cheap and bound to one key; the circuit breaker is per instance, so it is disabled here.
    const lock = createLock({
      adapter: this.adapter,
      key: resource,
      ttl: ttlMs,
      retryAttempts: 10,
      retryDelay: 200,
      circuitBreaker: false,
    });
    try {
      return await lock.using(fn);
    } catch (error) {
      if (error instanceof LockAcquisitionError) {
        this.logger.debug({ resource, attempts: error.attempts, cause: error.cause?.message }, "lock not acquired");
        throw new LockContentionError(resource, ttlMs);
      }
      throw error;
    }
  }
}
