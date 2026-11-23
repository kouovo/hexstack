import { appRouter } from "@app/api-contract";
import { RpcServer } from "@app/common/rpc";
import { createMiddleware } from "hono/factory";

const server = new RpcServer(appRouter);

/** Mounts the oRPC router. Unmatched paths fall through to Hono's 404. */
export const rpc = ({ prefix }: { prefix: `/${string}` }) =>
  createMiddleware(async (c, next) => {
    const { matched, response } = await server.handle(c.req.raw, { prefix });
    if (matched) return c.newResponse(response.body, response);
    await next();
  });
