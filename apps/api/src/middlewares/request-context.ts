import { requestContextStorage } from "@app/context";
import { generateId } from "@app/core";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Socket address of the client. Behind a reverse proxy this is the proxy: derive it from the proxy's
 * trusted header instead (never trust X-Forwarded-For from the open internet).
 */
function clientAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined; // not running on @hono/node-server (e.g. app.request in tests)
  }
}

/** Runs the rest of the request inside the AsyncLocalStorage request context. */
export const requestContext = () =>
  createMiddleware(async (c, next) => {
    const requestId = c.req.header(REQUEST_ID_HEADER) ?? generateId("req");
    c.header(REQUEST_ID_HEADER, requestId);
    await requestContextStorage.run({ requestId, clientAddress: clientAddress(c) }, next);
  });
