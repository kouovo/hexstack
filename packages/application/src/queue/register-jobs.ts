import { container } from "@app/di";

import { getJobHandlerMetadata } from "./job-handler.decorator";
import { JOB_DISPATCHER, type JobDispatcher } from "./queue.port";

type JobHandlerClass = new (...args: any[]) => object;

/** Explicit startup registration; decorators never resolve DI or start workers. */
export function registerJobs(handlers: readonly JobHandlerClass[]): void {
  const dispatcher = container.resolve<JobDispatcher>(JOB_DISPATCHER);
  const names = new Set<string>();
  for (const Handler of handlers) {
    const registrations = getJobHandlerMetadata(Handler);
    if (registrations.length === 0) throw new Error(`Missing @jobHandler on ${Handler.name}`);
    const instance = container.resolve<object>(Handler);
    for (const { name, method, options } of registrations) {
      if (names.has(name)) throw new Error(`Job already registered: ${name}`);
      names.add(name);
      const process: unknown = Reflect.get(instance, method);
      if (typeof process !== "function") throw new Error(`Invalid job method: ${Handler.name}.${String(method)}`);
      dispatcher.registerJob(
        name,
        async (payload) => {
          await process.call(instance, payload);
        },
        options,
      );
    }
  }
}
