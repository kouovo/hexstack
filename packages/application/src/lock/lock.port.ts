import { inject } from "@app/di";

/** Aborted when the lease is lost (auto-extension failed). Check it before any write that relies on exclusivity. */
export type LockSignal = AbortSignal & { readonly error?: Error };

export function assertLockHeld(signal: LockSignal, resource: string): void {
  if (signal.aborted) {
    throw signal.error ?? new Error(`Lock lease lost: ${resource}`);
  }
}

/**
 * Contention past the retry budget throws `LockContentionError`. A lock coordinates, it does not guarantee
 * correctness: keep database constraints authoritative.
 */
export interface LockPort {
  using<T>(resource: string, ttlMs: number, fn: (signal: LockSignal) => Promise<T>): Promise<T>;
}

export const LOCK = Symbol.for("LOCK");
export const injectLock = () => inject(LOCK);
