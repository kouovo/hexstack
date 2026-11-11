import { inject } from "@app/di";

export type ApplicationTransactionOptions = {
  isolationLevel?: "read committed" | "repeatable read" | "serializable";
  /** 0 disables it. Omitted: the env default, or the heavy one with {@link heavy}. */
  statementTimeoutMs?: number;
  /** Heavy-operation timeout (purge / cascade teardown). */
  heavy?: boolean;
};

export interface ApplicationTransactionPort {
  run<T>(callback: () => Promise<T>, options?: ApplicationTransactionOptions): Promise<T>;
}

export const APPLICATION_TRANSACTION_PORT = Symbol.for("APPLICATION_TRANSACTION_PORT");
export const injectApplicationTransaction = () => inject(APPLICATION_TRANSACTION_PORT);
