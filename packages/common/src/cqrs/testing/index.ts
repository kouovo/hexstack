import { AsyncLocalStorage } from "node:async_hooks";

import type { ApplicationTransactionOptions, ApplicationTransactionPort, TransactionHook, TransactionHooks } from "../transaction.port";

/**
 * In-memory {@link ApplicationTransactionPort} with the real hook semantics: a nested `run` joins the outer one,
 * before-commit hooks run inside it (a throw rolls back), after-commit hooks run after "commit" and never throw.
 * `log` records "commit" / "rollback" of each outermost run.
 */
export class FakeApplicationTransaction implements ApplicationTransactionPort {
  readonly runs: (ApplicationTransactionOptions | undefined)[] = [];
  private readonly active = new AsyncLocalStorage<TransactionHooks>();

  constructor(readonly log: string[] = []) {}

  async run<T>(callback: () => Promise<T>, options?: ApplicationTransactionOptions): Promise<T> {
    if (this.active.getStore()) return callback();
    this.runs.push(options);
    const before: TransactionHook[] = [];
    const after: TransactionHook[] = [];
    const hooks: TransactionHooks = { beforeCommit: (hook) => void before.push(hook), afterCommit: (hook) => void after.push(hook) };
    let result: T;
    try {
      result = await this.active.run(hooks, async () => {
        const result = await callback();
        for (let hook = before.shift(); hook; hook = before.shift()) await hook();
        return result;
      });
      this.log.push("commit");
    } catch (error) {
      this.log.push("rollback");
      throw error;
    }
    for (const hook of after)
      await Promise.resolve()
        .then(hook)
        .catch(() => undefined);
    return result;
  }

  current(): TransactionHooks | undefined {
    return this.active.getStore();
  }
}
