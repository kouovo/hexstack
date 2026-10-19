import type { InjectionToken } from "@app/di";

export interface CliServices {
  resolve<T>(token: InjectionToken<T>): Promise<T>;
}

export type AppCliContext = {
  services: CliServices;
};
