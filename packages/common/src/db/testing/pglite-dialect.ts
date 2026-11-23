import type { PGlite } from "@electric-sql/pglite";
import {
  CompiledQuery,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type QueryCompiler,
  type QueryResult,
  type TransactionSettings,
} from "kysely";

class PgliteConnection implements DatabaseConnection {
  public constructor(private readonly client: PGlite) {}

  public async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const result = await this.client.query<O>(compiledQuery.sql, [...compiledQuery.parameters]);

    return {
      rows: result.rows,
      ...(result.affectedRows === undefined ? {} : { numAffectedRows: BigInt(result.affectedRows) }),
    };
  }

  public streamQuery<O>(): AsyncIterableIterator<QueryResult<O>> {
    throw new Error("PGlite does not support streaming queries.");
  }
}

class PgliteDriver implements Driver {
  public constructor(private readonly client: PGlite) {}

  public async init(): Promise<void> {}

  public async acquireConnection(): Promise<DatabaseConnection> {
    return new PgliteConnection(this.client);
  }

  public async beginTransaction(connection: DatabaseConnection, settings: TransactionSettings): Promise<void> {
    void settings;
    await connection.executeQuery(CompiledQuery.raw("BEGIN"));
  }

  public async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("COMMIT"));
  }

  public async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("ROLLBACK"));
  }

  public async releaseConnection(connection: DatabaseConnection): Promise<void> {
    void connection;
  }

  public async destroy(): Promise<void> {
    await this.client.close();
  }

  public async savepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler["compileQuery"],
  ): Promise<void> {
    void compileQuery;
    await connection.executeQuery(CompiledQuery.raw(`SAVEPOINT ${savepointName}`));
  }

  public async rollbackToSavepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler["compileQuery"],
  ): Promise<void> {
    void compileQuery;
    await connection.executeQuery(CompiledQuery.raw(`ROLLBACK TO SAVEPOINT ${savepointName}`));
  }

  public async releaseSavepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler["compileQuery"],
  ): Promise<void> {
    void compileQuery;
    await connection.executeQuery(CompiledQuery.raw(`RELEASE SAVEPOINT ${savepointName}`));
  }
}

export class PgliteDialect implements Dialect {
  public constructor(private readonly client: PGlite) {}

  public createAdapter() {
    return new PostgresAdapter();
  }

  public createDriver(): Driver {
    return new PgliteDriver(this.client);
  }

  public createIntrospector(db: Kysely<unknown>) {
    return new PostgresIntrospector(db);
  }

  public createQueryCompiler() {
    return new PostgresQueryCompiler();
  }
}
