import { type KyselyTables, tableName } from "@app/common/db/schema";
import type { Selectable } from "kysely";

import type { session, user } from "./identity.schema";

/** The tables the identity context owns. Repositories query through `getExecutor<IdentityDatabase>()`. */
export type IdentityDatabase = KyselyTables<{ user: typeof user; session: typeof session }>;

export const USER_TABLE = tableName("user");
export const SESSION_TABLE = tableName("session");

export type User = Selectable<IdentityDatabase[typeof USER_TABLE]>;
export type Session = Selectable<IdentityDatabase[typeof SESSION_TABLE]>;
