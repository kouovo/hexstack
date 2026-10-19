import { type IOutboxRepository, type OutboxEntry, type OutboxMessage } from "@app/application";
import { singleton } from "@app/di";
import { sql } from "kysely";

import { OUTBOX_TABLE } from "../db";
import { fromPersistenceDate } from "../persistence-date";
import { toPersistenceJson } from "../persistence-json";
import { type ITransactionManager, injectTransactionManager } from "../transaction";

@singleton()
export class OutboxRepository implements IOutboxRepository {
  constructor(
    @injectTransactionManager()
    private readonly transactionManager: ITransactionManager,
  ) {}

  async insert(entry: OutboxEntry): Promise<void> {
    await this.transactionManager
      .getExecutor()
      .insertInto(OUTBOX_TABLE)
      .values({
        id: entry.id,
        aggregate_type: entry.aggregateType,
        aggregate_id: entry.aggregateId,
        event_type: entry.eventType,
        payload: toPersistenceJson(entry.payload),
        correlation_id: entry.correlationId,
      })
      .execute();
  }

  async publishPending(limit: number, publish: (entry: OutboxMessage) => Promise<void>): Promise<number> {
    if (limit <= 0) return 0;

    // Rows stay locked (FOR UPDATE SKIP LOCKED) until enqueue + acknowledgement commit or roll back together.
    return this.transactionManager.withTransaction(async () => {
      const db = this.transactionManager.getExecutor();
      const rows = await db
        .selectFrom(OUTBOX_TABLE)
        .select(["id", "seq", "aggregate_type", "aggregate_id", "event_type", "payload", "correlation_id", "created_at"])
        .where("published_at", "is", null)
        .orderBy("seq", "asc")
        .limit(limit)
        .forUpdate()
        .skipLocked()
        .execute();

      for (const row of rows) {
        await publish({
          id: row.id,
          seq: Number(row.seq),
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          eventType: row.event_type,
          payload: row.payload,
          correlationId: row.correlation_id,
          createdAt: fromPersistenceDate(row.created_at),
        });
      }

      if (rows.length > 0) {
        await db
          .updateTable(OUTBOX_TABLE)
          .set({ published_at: sql<Date>`now()` })
          .where(
            "id",
            "in",
            rows.map((row) => row.id),
          )
          .execute();
      }
      return rows.length;
    });
  }

  async deletePublishedBefore(cutoff: Date, limit: number): Promise<number> {
    if (limit <= 0) return 0;
    const result = await sql<{ id: string }>`
      delete from ${sql.table(OUTBOX_TABLE)}
      where id in (
        select id from ${sql.table(OUTBOX_TABLE)}
        where published_at < ${cutoff.toISOString()}::timestamptz
        order by seq
        limit ${limit}
        for update skip locked
      )
      returning id
    `.execute(this.transactionManager.getExecutor());
    return result.rows.length;
  }
}
