import { join } from "node:path";

import { createLogger } from "@app/logger";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate as drizzleMigrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { requirePostgresUrl } from "./client";

const logger = createLogger("migrate");

/** Any constant works; it only has to be the same for every replica of this app. */
const MIGRATION_ADVISORY_LOCK_KEY = 1801676911;

export type MigrateOptions = {
  /** Directory containing `postgres/` (drizzle-kit output). */
  migrationsRoot?: string;
};

/**
 * Applies pending migrations under a session-level advisory lock so concurrent deploys
 * (several replicas / a Helm hook racing a manual run) apply each migration exactly once.
 */
export async function migrate({ migrationsRoot = "./drizzle" }: MigrateOptions = {}): Promise<void> {
  const pg = postgres(requirePostgresUrl(), { max: 1, onnotice: () => {} });
  try {
    await pg`SELECT pg_advisory_lock(${MIGRATION_ADVISORY_LOCK_KEY})`;
    const migrationsFolder = join(migrationsRoot, "postgres");
    logger.info({ migrationsFolder }, "applying migrations");
    await drizzleMigrate(drizzle(pg), { migrationsFolder });
  } finally {
    // A failed migrate must not leak the session lock; unlock then close.
    await pg`SELECT pg_advisory_unlock(${MIGRATION_ADVISORY_LOCK_KEY})`.catch(() => undefined);
    await pg.end().catch(() => undefined);
  }
}
