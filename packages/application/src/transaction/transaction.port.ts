import { inject } from "@app/di";

export type ApplicationTransactionOptions = {
  isolationLevel?: "read committed" | "repeatable read" | "serializable";
  /**
   * Override statement timeout for this transaction (milliseconds).
   * 0 disables the timeout for this call. When omitted, the adapter applies
   * the default or heavy env timeout based on {@link heavy}.
   */
  statementTimeoutMs?: number;
  /**
   * Use the configured heavy-operation timeout (purge / cascade teardown).
   * Ignored when {@link statementTimeoutMs} is set explicitly.
   */
  heavy?: boolean;
};

export interface ApplicationTransactionPort {
  run<T>(callback: () => Promise<T>, options?: ApplicationTransactionOptions): Promise<T>;
}

export const APPLICATION_TRANSACTION_PORT = Symbol.for("APPLICATION_TRANSACTION_PORT");
export const injectApplicationTransaction = () => inject(APPLICATION_TRANSACTION_PORT);
