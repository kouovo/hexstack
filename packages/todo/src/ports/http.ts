import { authorize } from "@app/common/auth";
import { MEDIATOR, type Mediator } from "@app/common/cqrs";
import { container } from "@app/common/di";
import type { Context } from "hono";

import { ListTodosQuery, listTodosQuery } from "../app/query/list-todos.query";

const listTodosParams = listTodosQuery.partial().optional();

/** REST example: `GET /todos`. Authorization lives here because Hono routes do not inherit oRPC procedure meta. */
export async function listTodos(c: Context): Promise<Response> {
  authorize({ todo: ["read"] });

  const limit = c.req.query("limit");
  const parsed = listTodosParams.safeParse({
    status: c.req.query("status"),
    limit: limit === undefined ? undefined : Number(limit),
  });
  if (!parsed.success) {
    return c.json({ _tag: "InvalidInput", message: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const todos = await container.resolve<Mediator>(MEDIATOR).query(ListTodosQuery, parsed.data ?? {});
  return c.json({ todos });
}
