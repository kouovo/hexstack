import type { InjectionToken } from "@app/common/di";

export interface CliServices {
  resolve<T>(token: InjectionToken<T>): Promise<T>;
}

export type AppCliContext = {
  services: CliServices;
};
