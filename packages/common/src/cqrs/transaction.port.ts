import { inject } from "../di";

export type ApplicationTransactionOptions = {
  isolationLevel?: "read committed" | "repeatable read" | "serializable";
  /** 0 disables it. Omitted: the env default, or the heavy one with {@link heavy}. */
  statementTimeoutMs?: number;
  /** Heavy-operation timeout (purge / cascade teardown). */
  heavy?: boolean;
};

export type TransactionHook = () => Promise<void> | void;

/** Hooks of the outermost transaction; a nested `run` shares them. */
export interface TransactionHooks {
  /** Inside the transaction, after its work; a throw rolls it back. Hooks may register more hooks. */
  beforeCommit(hook: TransactionHook): void;
  /** After the commit, in order; a throw is logged and swallowed (the commit stands). Skipped on rollback. */
  afterCommit(hook: TransactionHook): void;
}

export interface ApplicationTransactionPort {
  /** A nested `run` joins the outer transaction (no savepoint); its options are ignored. */
  run<T>(callback: () => Promise<T>, options?: ApplicationTransactionOptions): Promise<T>;
  /** Hooks of the active transaction; undefined outside one. */
  current(): TransactionHooks | undefined;
}

export const APPLICATION_TRANSACTION_PORT = Symbol.for("APPLICATION_TRANSACTION_PORT");
export const injectApplicationTransaction = () => inject(APPLICATION_TRANSACTION_PORT);
