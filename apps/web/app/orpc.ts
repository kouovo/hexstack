import { clientEnv } from "@app/env/client";
import { createRPCClient } from "@app/rpc/client";
import type { InferClientOutputs } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

/** Typed by AppRouter: no codegen, and a renamed procedure or changed DTO is a compile error here. */
export const client = createRPCClient({
  // Resolve lazily after the root layout's public-env script (also avoids build-time reads during SSR).
  url: () => clientEnv.NEXT_PUBLIC_RPC_URL,
  // API and web use different ports/origins. The browser owns the HttpOnly session cookie.
  fetch: (request, init) => fetch(request, { ...init, credentials: "include" }),
});

/** TanStack Query helpers: orpc.todo.list.queryOptions(...), orpc.todo.create.mutationOptions(...), orpc.todo.key(). */
export const orpc = createTanstackQueryUtils(client);

export type Outputs = InferClientOutputs<typeof client>;
export type Todo = Outputs["todo"]["list"][number];
export type CurrentUser = NonNullable<Outputs["auth"]["me"]>;
export type Permissions = CurrentUser["permissions"];

export const errorMessage = (error: unknown): string | undefined =>
  error instanceof Error ? error.message : error ? String(error) : undefined;
