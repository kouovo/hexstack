import { defineConfig } from "drizzle-kit";

import { TABLES_FILTER } from "./schema/table-prefix";

export default defineConfig({
  schema: "./schema/index.ts",
  out: "../../apps/api/drizzle/postgres",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.POSTGRES_URL ?? "postgres://app:app@localhost:5432/app",
  },
  tablesFilter: [TABLES_FILTER],
});
