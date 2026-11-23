import { TABLES_FILTER } from "@app/common/db/schema";
import { defineConfig } from "drizzle-kit";

/** One database, one migration history: every bounded context keeps its tables in `src/adapters/*.schema.ts`. */
export default defineConfig({
  schema: "../../packages/*/src/adapters/*.schema.ts",
  out: "./drizzle/postgres",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.POSTGRES_DIRECT_URL ?? process.env.POSTGRES_URL ?? "postgres://app:app@localhost:5432/app",
  },
  tablesFilter: [TABLES_FILTER],
});
