import { container } from "@app/di";
import { RpcServer } from "@app/rpc/server";
import { createMiddleware } from "hono/factory";

/** Mounts the oRPC router. Unmatched paths fall through to Hono's 404. */
export const rpc = ({ prefix }: { prefix: `/${string}` }) =>
  createMiddleware(async (c, next) => {
    const { matched, response } = await container.resolve(RpcServer).handle(c.req.raw, { prefix });
    if (matched) return c.newResponse(response.body, response);
    await next();
  });
