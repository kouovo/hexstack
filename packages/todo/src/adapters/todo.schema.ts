import { pgTable, timestamp } from "@app/common/db/schema";
import { sql } from "drizzle-orm";
import { check, index, text } from "drizzle-orm/pg-core";

/** Example bounded context. Copy this file when adding a new one. */
export const todo = pgTable(
  "todo",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    status: text("status").default("open").notNull(),
    completedAt: timestamp("completed_at"),
    completionNotifiedAt: timestamp("completion_notified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check("todo_status_check", sql`status in ('open', 'completed', 'archived')`),
    index("todo_created_at_idx").on(table.createdAt),
  ],
);
