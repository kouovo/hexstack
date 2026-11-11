import { RequestContext, type RequestPrincipal } from "@app/context";
import { container } from "@app/di";
import { type Permissions, roleHasPermissions, ForbiddenException, UnauthorizedException } from "@app/domain";
import { os } from "@orpc/server";
import type { ResponseHeadersPluginContext } from "@orpc/server/plugins";

import { handleRpcErrors } from "./errors";

export type RpcProcedureMeta = {
  type?: "query" | "mutation";
  /** Opt out of the default "must be signed in" rule (sign-in, sign-up, me). */
  public?: boolean;
  /** The caller's role must grant all of these. */
  permissions?: Permissions;
};

/** Only valid inside non-public procedures. */
export function currentPrincipal(): RequestPrincipal {
  const principal = container.resolve(RequestContext).getPrincipal();
  if (!principal) throw new UnauthorizedException("Sign in required");
  return principal;
}

/** Secure by default: without `public: true`, anonymous callers get 401. */
const rpc = os
  .$context<ResponseHeadersPluginContext>()
  .$meta<RpcProcedureMeta>({ type: "query" })
  .use(({ next }) => handleRpcErrors(async () => next()))
  .use(({ next, procedure }) => {
    const meta = procedure["~orpc"].meta;
    if (!meta.public) {
      const principal = currentPrincipal();
      if (meta.permissions && !roleHasPermissions(principal.role, meta.permissions)) {
        throw new ForbiddenException("You do not have permission to do this");
      }
    }
    return next();
  });

export const rpcQuery = rpc.route({ method: "GET" });
export const rpcMutation = rpc.route({ method: "POST" }).meta({
  type: "mutation",
});
