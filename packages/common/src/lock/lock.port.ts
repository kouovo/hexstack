import { inject } from "../di";

/** Aborted when the lease is lost (auto-extension failed). Check it before any write that relies on exclusivity. */
export type LockSignal = AbortSignal & { readonly error?: Error };

export function assertLockHeld(signal: LockSignal, resource: string): void {
  if (signal.aborted) {
    throw signal.error ?? new Error(`Lock lease lost: ${resource}`);
  }
}

/** A lease taken by `tryAcquire`. It is not extended: it ends at `release()` or when its TTL runs out. */
export interface LockLease {
  /** Deletes the lease only if this holder still owns it. Never throws: a failed release expires by TTL. */
  release(): Promise<void>;
}

/**
 * A lock coordinates, it does not guarantee correctness: keep database constraints authoritative.
 * Lock-store errors (e.g. Redis unreachable) propagate at once and are never retried as contention.
 */
export interface LockPort {
  /**
   * Waits for the lock, runs `fn` while auto-extending the lease, then releases it.
   * Contention past the wait budget throws `LockContentionError`.
   */
  using<T>(resource: string, ttlMs: number, fn: (signal: LockSignal) => Promise<T>): Promise<T>;
  /** One attempt, no waiting: `undefined` when another holder has the lock. */
  tryAcquire(resource: string, ttlMs: number): Promise<LockLease | undefined>;
}

export const LOCK = Symbol.for("LOCK");
export const injectLock = () => inject(LOCK);
