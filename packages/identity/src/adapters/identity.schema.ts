import { pgTable, timestamp } from "@app/common/db/schema";
import { sql } from "drizzle-orm";
import { check, index, text, uniqueIndex } from "drizzle-orm/pg-core";

/** Permissions per role live in domain/rbac. */
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

/** Only SHA-256(secret) is stored. */
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
