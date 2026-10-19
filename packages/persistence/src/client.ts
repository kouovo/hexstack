import { container, inject, instanceCachingFactory } from "@app/di";
import { env } from "@app/env";
import postgres from "postgres";

export const DB_CLIENT = Symbol.for("DB_CLIENT");
export const injectDBClient = () => inject(DB_CLIENT);

export function requirePostgresUrl(): string {
  if (!env.POSTGRES_URL) throw new Error("POSTGRES_URL is required");
  return env.POSTGRES_URL;
}

export function registerDBClient() {
  container.register(DB_CLIENT, {
    useFactory: instanceCachingFactory(() => postgres(requirePostgresUrl())),
  });
}
