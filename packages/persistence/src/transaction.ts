import { AsyncLocalStorage } from "node:async_hooks";

import { container, inject, singleton } from "@app/di";
import type { IsolationLevel, Kysely, Transaction as KyselyTransaction } from "kysely";
import { sql } from "kysely";

import type { Database } from "./db";
import type { ISqlQueryBuilder } from "./kysely";
import { injectSqlQueryBuilder } from "./query-builder";

export type DatabaseTransaction = KyselyTransaction<Database>;
export type TransactionExecutor = Kysely<Database> | DatabaseTransaction;
export type UntypedTransaction = KyselyTransaction<any>;
export type UntypedTransactionExecutor = Kysely<any> | UntypedTransaction;

export interface TransactionScope {
  transaction: DatabaseTransaction;
}

export interface TransactionOptions {
  isolationLevel?: IsolationLevel;
  /**
   * Apply `SET LOCAL statement_timeout` for the duration of this transaction.
   * Nested `withTransaction` reuses the outer scope and does not re-apply.
   */
  statementTimeoutMs?: number;
}

export const TRANSACTION_SCOPE_STORAGE = Symbol.for("TRANSACTION_SCOPE_STORAGE");
export const injectTransactionScopeStorage = () => inject(TRANSACTION_SCOPE_STORAGE);

export function registerTransactionScopeStorage() {
  if (!container.isRegistered(TRANSACTION_SCOPE_STORAGE)) {
    container.register(TRANSACTION_SCOPE_STORAGE, {
      useValue: new AsyncLocalStorage<TransactionScope>(),
    });
  }
}

export interface ITransactionManager {
  withTransaction: <T = any>(callback: () => Promise<T>, options?: TransactionOptions) => Promise<T>;
  getExecutor: () => TransactionExecutor;
  getUntypedExecutor: () => UntypedTransactionExecutor;
}

export const TRANSACTION_MANAGER = Symbol.for("TRANSACTION_MANAGER");
export const injectTransactionManager = () => inject(TRANSACTION_MANAGER);

export function registerTransactionManager() {
  registerTransactionScopeStorage();
  if (!container.isRegistered(TRANSACTION_MANAGER)) {
    container.register<ITransactionManager>(TRANSACTION_MANAGER, {
      useClass: TransactionManager,
    });
  }
}

/** Format a positive ms value for Postgres `statement_timeout` / `set_config`. */
export function formatStatementTimeout(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error(`statementTimeoutMs must be a positive number, got ${ms}`);
  }
  return `${Math.floor(ms)}ms`;
}

@singleton()
export class TransactionManager implements ITransactionManager {
  constructor(
    @injectTransactionScopeStorage()
    private readonly scopeStorage: AsyncLocalStorage<TransactionScope>,
    @injectSqlQueryBuilder()
    private readonly queryBuilder: ISqlQueryBuilder,
  ) {}

  withTransaction<T = any>(callback: () => Promise<T>, options: TransactionOptions = {}): Promise<T> {
    if (this.currentTransaction) {
      return callback();
    }

    let transactionBuilder = this.queryBuilder.transaction();
    if (options.isolationLevel) {
      transactionBuilder = transactionBuilder.setIsolationLevel(options.isolationLevel);
    }

    return transactionBuilder.execute(async (transaction) => {
      if (options.statementTimeoutMs !== undefined && options.statementTimeoutMs > 0) {
        // set_config(..., is_local=true) ≡ SET LOCAL; parameterized, no string concat of SQL.
        await sql`select set_config('statement_timeout', ${formatStatementTimeout(options.statementTimeoutMs)}, true)`.execute(transaction);
      }

      return this.scopeStorage.run({ transaction }, callback);
    });
  }

  getExecutor(): TransactionExecutor {
    return this.currentTransaction ?? this.queryBuilder;
  }

  getUntypedExecutor(): UntypedTransactionExecutor {
    return this.currentTransaction ?? this.queryBuilder;
  }

  private get currentTransaction(): DatabaseTransaction | undefined {
    return this.scopeStorage.getStore()?.transaction;
  }
}
