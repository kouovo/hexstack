import { createLogger } from "@app/logger";
import { type Dialect, Kysely, ParseJSONResultsPlugin } from "kysely";

import type { Database } from "./db";

export function createKyselyQueryBuilder(dialect: Dialect) {
  const logger = createLogger("database");

  return new Kysely<Database>({
    dialect,
    plugins: [new ParseJSONResultsPlugin()],
    log: (event) => {
      if (event.level === "error") {
        logger.error(
          { err: event.error, query: event.query.sql, params: event.query.parameters, duration: event.queryDurationMillis },
          "kysely.error",
        );
      }
    },
  });
}

export type ISqlQueryBuilder = ReturnType<typeof createKyselyQueryBuilder>;
