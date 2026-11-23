import { os } from "@orpc/server";
import type { ResponseHeadersPluginContext } from "@orpc/server/plugins";

import { authorize, type Permissions } from "../auth/authorization";
import { handleRpcErrors } from "./errors";

export type RpcProcedureMeta = {
  type?: "query" | "mutation";
  /** Opt out of the default "must be signed in" rule (sign-in, sign-up, me). */
  public?: boolean;
  /** The caller's role must grant all of these. */
  permissions?: Permissions;
};

/** Secure by default: without `public: true`, anonymous callers get 401. */
const rpc = os
  .$context<ResponseHeadersPluginContext>()
  .$meta<RpcProcedureMeta>({ type: "query" })
  .use(({ next }) => handleRpcErrors(async () => next()))
  .use(({ next, procedure }) => {
    const meta = procedure["~orpc"].meta;
    if (!meta.public) authorize(meta.permissions);
    return next();
  });

export const rpcQuery = rpc.route({ method: "GET" });
export const rpcMutation = rpc.route({ method: "POST" }).meta({
  type: "mutation",
});
