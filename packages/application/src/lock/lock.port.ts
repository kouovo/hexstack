import { inject } from "@app/di";

/** Aborted when the lease is lost (auto-extension failed). Check it before any write that relies on exclusivity. */
export type LockSignal = AbortSignal & { readonly error?: Error };

export function assertLockHeld(signal: LockSignal, resource: string): void {
  if (signal.aborted) {
    throw signal.error ?? new Error(`Lock lease lost: ${resource}`);
  }
}

/**
 * Distributed mutual exclusion. `using` acquires `resource`, auto-extends while `fn` runs and releases afterwards.
 * Contention past the retry budget throws `LockContentionError` (`@app/domain`).
 * A lock is an optimization/coordination tool, not a correctness guarantee: keep database constraints authoritative.
 */
export interface LockPort {
  using<T>(resource: string, ttlMs: number, fn: (signal: LockSignal) => Promise<T>): Promise<T>;
}

export const LOCK = Symbol.for("LOCK");
export const injectLock = () => inject(LOCK);
