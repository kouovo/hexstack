import { z } from "@app/zod";

export const serverEnvSchema = {
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  /** Adds `Secure` to the session cookie. Keep true; Safari needs false for plain-http localhost. */
  SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  /** Comma-separated list of browser origins allowed by CORS. */
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  /** Redis cache is optional and fail-open; queue/auth Redis behavior is unchanged. */
  CACHE_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  CACHE_KEY_PREFIX: z.string().trim().min(1).default("app:cache:"),
  STORAGE_DRIVER: z.enum(["local", "minio"]).default("local"),
  STORAGE_BUCKET: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
    .default("app"),
  STORAGE_LOCAL_ROOT: z.string().trim().min(1).default(".app-storage"),
  STORAGE_MINIO_ENDPOINT: z.url().default("http://localhost:9000"),
  STORAGE_MINIO_ACCESS_KEY: z.string().min(1).optional(),
  STORAGE_MINIO_SECRET_KEY: z.string().min(1).optional(),
  STORAGE_MINIO_REGION: z.string().trim().min(1).default("us-east-1"),
  STORAGE_MINIO_USE_SSL: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  POSTGRES_URL: z.string().optional(),
  REDIS_URL: z.string().trim().optional(),
  /** Postgres statement_timeout for ordinary app transactions. 0 = disabled. */
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(0),
  /** Postgres statement_timeout for heavy operations. 0 = disabled. */
  DB_HEAVY_STATEMENT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(120_000),
  /** Repeat interval (ms) for publishing committed outbox rows to the BullMQ `domain-event` queue. */
  OUTBOX_RELAY_TICK_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  /** Scan interval for deleting outbox rows published more than seven days ago. */
  OUTBOX_CLEANUP_TICK_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
  /** BullMQ execution policy for durable domain-event consumers, not relay publication. */
  DOMAIN_EVENT_JOB_ATTEMPTS: z.coerce.number().int().positive().default(10),
  DOMAIN_EVENT_JOB_BACKOFF_MS: z.coerce.number().int().positive().default(1_000),
};

export const clientEnvSchema = {
  NEXT_PUBLIC_RPC_URL: z
    .url({ protocol: /^https?$/ })
    .pipe(
      z.string().refine((value) => {
        const url = new URL(value);
        return !url.username && !url.password;
      }, "Public URLs must not contain credentials"),
    )
    .default("http://localhost:3001/rpc"),
};

export const envSchema = {
  server: serverEnvSchema,
  client: clientEnvSchema,
} as const;
