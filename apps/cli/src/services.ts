import { container, type InjectionToken } from "@app/di";

import type { CliServices } from "./context";

export function createCliServices(): CliServices {
  let registration: Promise<void> | undefined;

  return {
    async resolve<T>(token: InjectionToken<T>): Promise<T> {
      registration ??= import("@app/bootstrap").then(({ registerDI }) => registerDI({ enableWorkers: false }));
      await registration;
      return container.resolve(token);
    },
  };
}
