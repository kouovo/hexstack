import { type KyselyTables, tableName } from "@app/common/db/schema";
import type { Insertable, Selectable, Updateable } from "kysely";

import type { todo } from "./todo.schema";

/** The tables the todo context owns. Repositories query through `getExecutor<TodoDatabase>()`. */
export type TodoDatabase = KyselyTables<{ todo: typeof todo }>;

export const TODO_TABLE = tableName("todo");

type TodoTable = TodoDatabase[typeof TODO_TABLE];
export type Todo = Selectable<TodoTable>;
export type NewTodo = Insertable<TodoTable>;
export type TodoUpdate = Updateable<TodoTable>;
