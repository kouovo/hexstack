import { sql } from "drizzle-orm";
import { check, index, pgTableCreator, text, timestamp as pgTimestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { tableName } from "./table-prefix";

const pgTable = pgTableCreator(tableName);

// Persist event times as PostgreSQL timestamptz while keeping JavaScript Date values.
const timestamp = <TName extends string>(name: TName) => pgTimestamp(name, { withTimezone: true, mode: "date" });

/** Example bounded context. Copy this table when adding a new one. */
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

/** Accounts. `role` is the single RBAC role; permissions per role live in domain/src/rbac. */
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("user_email_unique").on(table.email), check("user_role_check", sql`role in ('admin', 'member', 'viewer')`)],
);

/** Auth sessions. Only SHA-256(secret) is stored; the token never touches the database. */
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    secretHash: text("secret_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    refreshedAt: timestamp("refreshed_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("session_user_idx").on(table.userId), index("session_expires_at_idx").on(table.expiresAt)],
);
