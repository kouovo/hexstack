import { AsyncLocalStorage } from "node:async_hooks";

import type { IsolationLevel, Kysely, Transaction as KyselyTransaction } from "kysely";
import { sql } from "kysely";

import type { TransactionHook, TransactionHooks } from "../cqrs/transaction.port";
import { container, inject, singleton } from "../di";
import { createLogger } from "../logger";
import type { ISqlQueryBuilder } from "./kysely";
import { injectSqlQueryBuilder } from "./query-builder";

export type DatabaseTransaction<DB = any> = KyselyTransaction<DB>;
/** `DB` is the caller's own table map: a bounded context only sees the tables it owns. */
export type TransactionExecutor<DB = any> = Kysely<DB> | DatabaseTransaction<DB>;
export type UntypedTransaction = KyselyTransaction<any>;
export type UntypedTransactionExecutor = Kysely<any> | UntypedTransaction;

export interface TransactionScope {
  transaction: DatabaseTransaction;
  hooks: TransactionHooks;
}

export interface TransactionOptions {
  isolationLevel?: IsolationLevel;
  /** Not re-applied by a nested `withTransaction` (it joins the outer one). */
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
  getExecutor: <DB = any>() => TransactionExecutor<DB>;
  getUntypedExecutor: () => UntypedTransactionExecutor;
  /** Hooks of the active transaction; undefined outside one. */
  currentHooks: () => TransactionHooks | undefined;
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

export function formatStatementTimeout(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error(`statementTimeoutMs must be a positive number, got ${ms}`);
  }
  return `${Math.floor(ms)}ms`;
}

const logger = createLogger("transaction");

async function runAfterCommit(hooks: readonly TransactionHook[]): Promise<void> {
  for (const hook of hooks) {
    try {
      await hook();
    } catch (error) {
      logger.warn({ err: error }, "after-commit hook failed; the transaction is committed");
    }
  }
}

@singleton()
export class TransactionManager implements ITransactionManager {
  constructor(
    @injectTransactionScopeStorage()
    private readonly scopeStorage: AsyncLocalStorage<TransactionScope>,
    @injectSqlQueryBuilder()
    private readonly queryBuilder: ISqlQueryBuilder,
  ) {}

  async withTransaction<T = any>(callback: () => Promise<T>, options: TransactionOptions = {}): Promise<T> {
    if (this.currentTransaction) {
      return callback();
    }

    let transactionBuilder = this.queryBuilder.transaction();
    if (options.isolationLevel) {
      transactionBuilder = transactionBuilder.setIsolationLevel(options.isolationLevel);
    }

    const before: TransactionHook[] = [];
    const after: TransactionHook[] = [];
    const hooks: TransactionHooks = {
      beforeCommit: (hook) => void before.push(hook),
      afterCommit: (hook) => void after.push(hook),
    };

    const result = await transactionBuilder.execute(async (transaction) => {
      if (options.statementTimeoutMs !== undefined && options.statementTimeoutMs > 0) {
        // set_config(..., is_local=true) ≡ SET LOCAL; parameterized, no string concat of SQL.
        await sql`select set_config('statement_timeout', ${formatStatementTimeout(options.statementTimeoutMs)}, true)`.execute(transaction);
      }

      return this.scopeStorage.run({ transaction, hooks }, async () => {
        const result = await callback();
        for (let hook = before.shift(); hook; hook = before.shift()) await hook();
        return result;
      });
    });
    // The scope is gone: an after-commit hook that writes runs on the pool, not in the committed transaction.
    await runAfterCommit(after);
    return result;
  }

  getExecutor<DB = any>(): TransactionExecutor<DB> {
    return this.currentTransaction ?? this.queryBuilder;
  }

  getUntypedExecutor(): UntypedTransactionExecutor {
    return this.currentTransaction ?? this.queryBuilder;
  }

  currentHooks(): TransactionHooks | undefined {
    return this.scopeStorage.getStore()?.hooks;
  }

  private get currentTransaction(): DatabaseTransaction | undefined {
    return this.scopeStorage.getStore()?.transaction;
  }
}
