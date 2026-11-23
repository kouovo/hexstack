import type { AnyRouter, Meta } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin, StrictGetMethodPlugin } from "@orpc/server/plugins";

import { requestContextStorage } from "../context/request-context";
import { createLogger } from "../logger";
import type { RpcProcedureMeta } from "./procedure";

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

/** Serves one composed oRPC router (see @app/api-contract) over fetch, with request logging. */
export class RpcServer {
  private readonly logger = createLogger("rpc");
  private readonly handler: RPCHandler<Record<never, never>>;

  constructor(private readonly router: AnyRouter) {
    this.handler = new RPCHandler(router, {
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
  }

  getProcedureMeta(request: Request, options: Pick<RpcHandlerOptions, "prefix"> = {}): RpcProcedureMeta | undefined {
    const url = new URL(request.url);
    const segments = getPathSegments(url.pathname, options.prefix ?? defaultPrefix);

    let current: RpcRouter | RpcProcedure = this.router as unknown as RpcRouter;
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
