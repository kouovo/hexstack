import { createORPCClient } from "@orpc/client";
import { RPCLink, type RPCLinkOptions } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

import type { AppRouter } from "./router";

export type RPCClient = RouterClient<AppRouter>;

export type CreateRPCClientOptions = Omit<RPCLinkOptions<Record<never, never>>, "url"> & {
  /** A fixed URL or oRPC's lazy resolver (e.g. runtime public configuration). */
  url: RPCLinkOptions<Record<never, never>>["url"];
};

export function createRPCClient(options: CreateRPCClientOptions): RPCClient {
  const link = new RPCLink(options);

  return createORPCClient<RPCClient>(link);
}
