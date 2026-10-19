import { env } from "@app/env";
import { HTTP_STATUS, isKnownError, toPublicError, type PublicError } from "@app/rpc";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { timing } from "hono/timing";

import { authenticate } from "./middlewares/authenticate";
import { csrf } from "./middlewares/csrf";
import { appLogger } from "./middlewares/logger";
import { requestContext } from "./middlewares/request-context";
import { rpc } from "./middlewares/rpc";
import { listTodos } from "./routes/todos";

export type CreateAppOptions = {
  /** Browser origins allowed to call the API with cookies (CORS + CSRF). Defaults to CORS_ORIGINS. */
  trustedOrigins?: readonly string[];
};

/** HTTP composition only. DI must be registered by the caller (see index.ts), which keeps this testable. */
export function createApp({ trustedOrigins = env.CORS_ORIGINS }: CreateAppOptions = {}) {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: (origin) => (trustedOrigins.includes(origin) ? origin : null),
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );
  app.use("*", requestContext());
  app.use("*", csrf({ trustedOrigins }));
  app.use("*", authenticate());
  app.use("*", timing());

  app.onError((error, c) => {
    if (isKnownError(error)) return c.json(toPublicError(error), HTTP_STATUS[error.kind]);
    if (error instanceof HTTPException && error.status < 500) {
      return c.json({ _tag: "HttpError", message: "Request failed" } satisfies PublicError, error.status);
    }
    appLogger.error({ err: error, method: c.req.method, path: c.req.path }, "request error");
    return c.json({ _tag: "InternalError", message: "Internal server error" } satisfies PublicError, 500);
  });

  app.notFound((c) => c.json({ _tag: "NotFoundException", message: "Not found" } satisfies PublicError, 404));
  app.get("/health", (c) => c.json({ status: "ok" }));
  // REST example. Authorization lives in the handler: Hono routes do not inherit oRPC procedure meta.
  app.get("/todos", (c) => listTodos(c));
  app.use("/rpc/*", rpc({ prefix: "/rpc" }));

  return app;
}

export type App = ReturnType<typeof createApp>;
