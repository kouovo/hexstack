import { z } from "@app/zod";

import { clientEnvSchema } from "./schema";

/** Public runtime configuration only; never expose serverEnvSchema to the browser. */
export const PUBLIC_ENV_GLOBAL = "__APP_PUBLIC_ENV__";

const clientEnvParser = z.object(clientEnvSchema);
export type ClientEnv = z.infer<typeof clientEnvParser>;
const clientEnvKeys = Object.keys(clientEnvSchema) as (keyof ClientEnv)[];
type RawClientEnv = Partial<Record<keyof ClientEnv, string | undefined>>;

declare global {
  interface Window {
    [PUBLIC_ENV_GLOBAL]?: RawClientEnv;
  }
}

function parse(raw: RawClientEnv): ClientEnv {
  const values = Object.fromEntries(clientEnvKeys.map((key) => [key, raw[key] || undefined]));
  const result = clientEnvParser.safeParse(values);
  if (!result.success) throw new Error(`Invalid public environment variables: ${z.prettifyError(result.error)}`);
  return result.data;
}

let cached: ClientEnv | undefined;

export function getClientEnv(): ClientEnv {
  if (cached) return cached;
  if (typeof window === "undefined") {
    // Dynamic key lookup prevents Next from inlining NEXT_PUBLIC_* during the build.
    const source = process.env;
    cached = parse(Object.fromEntries(clientEnvKeys.map((key) => [key, source[key]])));
    return cached;
  }

  const injected = window[PUBLIC_ENV_GLOBAL];
  // Test harnesses can use defaults; don't cache them before the script arrives.
  if (!injected) return parse({});
  cached = parse(injected);
  return cached;
}

/** Server-only call: whitelist public keys and escape HTML script-closing characters. */
export function publicEnvScript(): string {
  const json = JSON.stringify(getClientEnv()).replace(/</g, "\\u003c");
  return `window.${PUBLIC_ENV_GLOBAL}=${json};`;
}

/** Lazy view: merely importing this module never resolves build-time configuration. */
export const clientEnv: ClientEnv = Object.defineProperties(
  {} as ClientEnv,
  Object.fromEntries(clientEnvKeys.map((key) => [key, { enumerable: true, get: () => getClientEnv()[key] }])),
);
