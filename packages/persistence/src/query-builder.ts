import { container, inject, instanceCachingFactory } from "@app/di";
import { PostgresJSDialect } from "kysely-postgres-js";
import type postgres from "postgres";

import { DB_CLIENT } from "./client";
import { createKyselyQueryBuilder } from "./kysely";

export const SQL_QUERY_BUILDER = Symbol("SQL_QUERY_BUILDER");
export const injectSqlQueryBuilder = () => inject(SQL_QUERY_BUILDER);

export function createPostgresKysely(pg: postgres.Sql) {
  return createKyselyQueryBuilder(new PostgresJSDialect({ postgres: pg }));
}

export function registerSqlQueryBuilder() {
  container.register(SQL_QUERY_BUILDER, {
    useFactory: instanceCachingFactory((c) => createPostgresKysely(c.resolve<postgres.Sql>(DB_CLIENT))),
  });
}
