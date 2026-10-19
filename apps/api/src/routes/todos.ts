import { type ITodoDTO, ListTodosQuery, listTodosQuery } from "@app/application";
import { requestContextStorage } from "@app/context";
import { QueryBus } from "@app/cqrs";
import { container } from "@app/di";
import { ForbiddenException, roleHasPermissions, UnauthorizedException } from "@app/domain";
import type { Context } from "hono";

const listTodosParams = listTodosQuery.partial().optional();

export async function listTodos(c: Context): Promise<Response> {
  const principal = requestContextStorage.getStore()?.principal;
  if (!principal) throw new UnauthorizedException("Sign in required");
  if (!roleHasPermissions(principal.role, { todo: ["read"] })) {
    throw new ForbiddenException("You do not have permission to do this");
  }

  const limit = c.req.query("limit");
  const parsed = listTodosParams.safeParse({
    status: c.req.query("status"),
    limit: limit === undefined ? undefined : Number(limit),
  });
  if (!parsed.success) {
    return c.json({ _tag: "InvalidInput", message: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const todos = await container.resolve(QueryBus).execute<ITodoDTO[]>(new ListTodosQuery(parsed.data ?? {}));
  return c.json({ todos });
}
