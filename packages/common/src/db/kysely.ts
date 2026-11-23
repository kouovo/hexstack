import { type Dialect, Kysely, ParseJSONResultsPlugin } from "kysely";

import { createLogger } from "../logger";
import { recordQuery } from "./db.telemetry";

export function createKyselyQueryBuilder(dialect: Dialect) {
  const logger = createLogger("database");

  // Untyped here: each bounded context types its own tables (see `TransactionManager.getExecutor`).
  return new Kysely<any>({
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
