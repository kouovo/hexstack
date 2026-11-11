import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The API runtime image's copy, or the source tree when run through tsx. */
export function resolveMigrationsRoot(): string {
  const configured = process.env.APP_MIGRATIONS_DIR?.trim();
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    configured ? resolve(configured) : undefined,
    resolve(here, "../drizzle"),
    resolve(here, "../../api/drizzle"),
    resolve(process.cwd(), "drizzle"),
    resolve(process.cwd(), "apps/api/drizzle"),
  ].filter((candidate): candidate is string => candidate !== undefined);

  const migrationsRoot = candidates.find((candidate) => existsSync(candidate));
  if (!migrationsRoot) {
    throw new Error(`Migration files were not found. Set APP_MIGRATIONS_DIR or run the CLI from the repository.`);
  }

  return migrationsRoot;
}
