import { container, type InjectionToken } from "@app/common/di";

import type { CliServices } from "./context";

export function createCliServices(): CliServices {
  let registration: Promise<void> | undefined;

  return {
    async resolve<T>(token: InjectionToken<T>): Promise<T> {
      // Loaded on first use, so commands that never resolve a service never load the whole application.
      registration ??= Promise.all([import("@app/common/bootstrap"), import("./contexts")]).then(([{ registerDI }, { CONTEXTS }]) =>
        registerDI({ contexts: CONTEXTS, enableWorkers: false }),
      );
      await registration;
      return container.resolve(token);
    },
  };
}
