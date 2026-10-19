import type { Kyselify } from "drizzle-orm/kysely";
import type { Insertable, Selectable, Updateable } from "kysely";

import type { outbox, session, todo, user } from "../schema/postgres";
import { tableName, type TABLE_PREFIX } from "../schema/table-prefix";

type OutboxTable = Kyselify<typeof outbox>;
export type Outbox = Selectable<OutboxTable>;
export type NewOutbox = Insertable<OutboxTable>;

type TodoTable = Kyselify<typeof todo>;
export type Todo = Selectable<TodoTable>;
export type NewTodo = Insertable<TodoTable>;
export type TodoUpdate = Updateable<TodoTable>;

type UserTable = Kyselify<typeof user>;
export type User = Selectable<UserTable>;

type SessionTable = Kyselify<typeof session>;
export type Session = Selectable<SessionTable>;

/** Unprefixed table name -> Kysely row type. Add new tables here. */
type Tables = {
  outbox: OutboxTable;
  todo: TodoTable;
  user: UserTable;
  session: SessionTable;
};

/** Kysely database type; keys carry TABLE_PREFIX. */
export type Database = { [K in keyof Tables as `${typeof TABLE_PREFIX}${K}`]: Tables[K] };

export const OUTBOX_TABLE = tableName("outbox");
export const TODO_TABLE = tableName("todo");
export const USER_TABLE = tableName("user");
export const SESSION_TABLE = tableName("session");
