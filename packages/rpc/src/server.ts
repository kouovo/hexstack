import { requestContextStorage } from "@app/context";
import { container, singleton } from "@app/di";
import { createLogger } from "@app/logger";
import { type Meta } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin, StrictGetMethodPlugin } from "@orpc/server/plugins";

import { type RpcProcedureMeta, router } from "./router";

type RpcHandlerOptions = {
  prefix?: `/${string}`;
  context?: Record<PropertyKey, unknown>;
};

interface RpcRouter {
  [key: string]: RpcRouter | RpcProcedure | undefined;
}

type RpcProcedure = {
  "~orpc": {
    meta: Meta;
  };
};

const defaultPrefix = "/rpc" satisfies `/${string}`;

const isRpcProcedure = (value: unknown): value is RpcProcedure => {
  return typeof value === "object" && value !== null && "~orpc" in value && typeof value["~orpc"] === "object" && value["~orpc"] !== null;
};

const stripPrefix = (pathname: string, prefix: `/${string}`) => {
  const normalizedPrefix = prefix.replace(/\/$/, "");

  if (pathname === normalizedPrefix) {
    return "";
  }

  if (pathname.startsWith(`${normalizedPrefix}/`)) {
    return pathname.slice(normalizedPrefix.length);
  }

  return pathname;
};

const getPathSegments = (pathname: string, prefix: `/${string}`) => {
  return stripPrefix(pathname, prefix)
    .replace(/^\/|\/$/g, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
};

@singleton()
export class RpcServer {
  logger = createLogger("rpc");

  private readonly handler = new RPCHandler(router, {
    // Gives procedures `context.resHeaders` (used by auth routes to set the session cookie).
    plugins: [new ResponseHeadersPlugin(), new StrictGetMethodPlugin()],
    adapterInterceptors: [
      async ({ request, next, prefix }) => {
        const resolvedPrefix = prefix ?? defaultPrefix;
        const meta = this.getProcedureMeta(request, { prefix: resolvedPrefix });
        const path = getPathSegments(new URL(request.url).pathname, resolvedPrefix).join(".") || "/";
        const type = meta?.type ?? "query";
        const requestId = requestContextStorage.getStore()?.requestId ?? request.headers.get("x-request-id") ?? undefined;
        const startedAt = performance.now();

        try {
          const result = await next();
          if (result.matched) {
            this.logger.info(
              { requestId, path, type, status: result.response.status, responseTime: Math.round(performance.now() - startedAt) },
              `orpc.${type}: ${path}`,
            );
          }
          return result;
        } catch (error) {
          this.logger.error(
            { err: error, requestId, path, type, responseTime: Math.round(performance.now() - startedAt) },
            `orpc.${type} error: ${path}`,
          );
          throw error;
        }
      },
    ],
  });

  getProcedureMeta(request: Request, options: Pick<RpcHandlerOptions, "prefix"> = {}): RpcProcedureMeta | undefined {
    const url = new URL(request.url);
    const segments = getPathSegments(url.pathname, options.prefix ?? defaultPrefix);

    let current: RpcRouter | RpcProcedure = router;
    for (const segment of segments) {
      if (isRpcProcedure(current) || !(segment in current)) {
        return undefined;
      }

      const nextNode: RpcRouter | RpcProcedure | undefined = current[segment];
      if (!nextNode) {
        return undefined;
      }

      current = nextNode;
    }

    if (!isRpcProcedure(current)) {
      return undefined;
    }

    return current["~orpc"].meta as RpcProcedureMeta;
  }

  handle(request: Request, options: RpcHandlerOptions = {}) {
    return this.handler.handle(request, options);
  }
}

export const getRpcProcedureMeta = (request: Request, options: Pick<RpcHandlerOptions, "prefix"> = {}): RpcProcedureMeta | undefined =>
  container.resolve(RpcServer).getProcedureMeta(request, options);

export function createRPCHandler(options: RpcHandlerOptions = {}) {
  const rpcServer = container.resolve(RpcServer);
  return (request: Request) => rpcServer.handle(request, options);
}

export type { AppRouter, RpcProcedureMeta } from "./router";
export { router };
