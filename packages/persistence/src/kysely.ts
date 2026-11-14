import { createLogger } from "@app/logger";
import { type Dialect, Kysely, ParseJSONResultsPlugin } from "kysely";

import type { Database } from "./db";
import { recordQuery } from "./db.telemetry";

export function createKyselyQueryBuilder(dialect: Dialect) {
  const logger = createLogger("database");

  return new Kysely<Database>({
    dialect,
    plugins: [new ParseJSONResultsPlugin()],
    log: (event) => {
      recordQuery(event);
      if (event.level === "error") {
        // No bound parameters: they can hold emails, password hashes or tokens, and logs leave the process (OTLP).
        logger.error({ err: event.error, query: event.query.sql, duration: event.queryDurationMillis }, "kysely.error");
      }
    },
  });
}

export type ISqlQueryBuilder = ReturnType<typeof createKyselyQueryBuilder>;
