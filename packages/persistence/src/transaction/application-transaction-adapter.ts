import { APPLICATION_TRANSACTION_PORT, type ApplicationTransactionOptions, type ApplicationTransactionPort } from "@app/application";
import { container, singleton } from "@app/di";
import { env } from "@app/env";

import { type ITransactionManager, injectTransactionManager } from "../transaction";

@singleton()
export class ApplicationTransactionAdapter implements ApplicationTransactionPort {
  constructor(
    @injectTransactionManager()
    private readonly transactionManager: ITransactionManager,
  ) {}

  run<T>(callback: () => Promise<T>, options: ApplicationTransactionOptions = {}): Promise<T> {
    const statementTimeoutMs = resolveStatementTimeoutMs(options);

    return this.transactionManager.withTransaction(callback, {
      isolationLevel: options.isolationLevel ?? "read committed",
      statementTimeoutMs,
    });
  }
}

export function resolveStatementTimeoutMs(options: ApplicationTransactionOptions): number | undefined {
  if (options.statementTimeoutMs !== undefined) {
    return options.statementTimeoutMs > 0 ? options.statementTimeoutMs : undefined;
  }

  const fromEnv = options.heavy ? env.DB_HEAVY_STATEMENT_TIMEOUT_MS : env.DB_STATEMENT_TIMEOUT_MS;
  return fromEnv > 0 ? fromEnv : undefined;
}

export function registerApplicationTransactionPort() {
  container.registerSingleton(APPLICATION_TRANSACTION_PORT, ApplicationTransactionAdapter);
}
