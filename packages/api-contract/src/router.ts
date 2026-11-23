import { rpcQuery } from "@app/common/rpc";
import { authRouter, userRouter } from "@app/identity";
import { todoRouter } from "@app/todo";

const ping = rpcQuery.meta({ public: true }).handler(async () => "pong" as const);

/** The public RPC surface: one key per bounded context's RPC port. Clients are typed by {@link AppRouter}. */
export const appRouter = {
  ping,
  auth: authRouter,
  user: userRouter,
  todo: todoRouter,
};

export type AppRouter = typeof appRouter;
