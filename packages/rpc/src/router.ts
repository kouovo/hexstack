import { rpcQuery } from "./procedure";
import { authRouter } from "./routes/auth";
import { todoRouter } from "./routes/todo";
import { userRouter } from "./routes/user";

const ping = rpcQuery.meta({ public: true }).handler(async () => "pong" as const);

/** Add one key per bounded context. */
export const router = {
  ping,
  auth: authRouter,
  user: userRouter,
  todo: todoRouter,
};

export type AppRouter = typeof router;
export type { RpcProcedureMeta } from "./procedure";
