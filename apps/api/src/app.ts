import { env } from "@app/common/env";
import { HTTP_STATUS, type PublicError, resolvePublicErrorCatalog } from "@app/common/errors";
import { authenticate } from "@app/identity";
import { listTodos } from "@app/todo";
import { httpInstrumentationMiddleware } from "@hono/otel";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { timing } from "hono/timing";

import { csrf } from "./middlewares/csrf";
import { appLogger } from "./middlewares/logger";
import { requestContext } from "./middlewares/request-context";
import { rpc } from "./middlewares/rpc";
import { SERVICE_NAME, SERVICE_VERSION } from "./service-info";

export type CreateAppOptions = {
  /** Browser origins allowed to call the API with cookies (CORS + CSRF). Defaults to CORS_ORIGINS. */
  trustedOrigins?: readonly string[];
};

/** HTTP composition only. DI must be registered by the caller (see index.ts), which keeps this testable. */
export function createApp({ trustedOrigins = env.CORS_ORIGINS }: CreateAppOptions = {}) {
  const app = new Hono();

  // First, so the server span covers CORS/auth too. A no-op unless the SDK was started (see telemetry.ts).
  app.use(
    "*",
    httpInstrumentationMiddleware({
      serviceName: SERVICE_NAME,
      serviceVersion: SERVICE_VERSION,
      // Query strings may carry tokens: keep them out of the tracing backend.
      getUrlFull: (c) => {
        const url = new URL(c.req.url);
        return `${url.origin}${url.pathname}`;
      },
    }),
  );
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
    const catalog = resolvePublicErrorCatalog();
    if (catalog.isKnown(error)) return c.json(catalog.project(error), HTTP_STATUS[error.kind]);
    if (error instanceof HTTPException && error.status < 500) {
      return c.json({ _tag: "HttpError", message: "Request failed" } satisfies PublicError, error.status);
    }
    appLogger.error({ err: error, method: c.req.method, path: c.req.path }, "request error");
    return c.json({ _tag: "InternalError", message: "Internal server error" } satisfies PublicError, 500);
  });

  app.notFound((c) => c.json({ _tag: "NotFoundException", message: "Not found" } satisfies PublicError, 404));
  app.get("/health", (c) => c.json({ status: "ok" }));
  // REST example, served by the todo context's HTTP port.
  app.get("/todos", (c) => listTodos(c));
  app.use("/rpc/*", rpc({ prefix: "/rpc" }));

  return app;
}

export type App = ReturnType<typeof createApp>;
