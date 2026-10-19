import { SessionService } from "@app/application";
import { readSessionToken, serializeClearedSessionCookie, serializeSessionCookie, SESSION_COOKIE_NAME } from "@app/auth";
import { requestContextStorage } from "@app/context";
import { container } from "@app/di";
import { createMiddleware } from "hono/factory";

/**
 * Resolves the session cookie to a principal for this request. It never rejects: anonymous requests continue,
 * and each procedure decides (oRPC meta: secure by default, `public: true` to opt out).
 * The role is read from the user row on every request, so role changes apply immediately.
 */
export const authenticate = () =>
  createMiddleware(async (c, next) => {
    // Never cache identity-dependent RPC responses or responses carrying Set-Cookie.
    c.header("cache-control", "no-store");
    let pendingCookie: string | undefined;
    const token = readSessionToken(c.req.header("cookie"));
    if (token) {
      const result = await container.resolve(SessionService).validate(token);
      const store = requestContextStorage.getStore();
      if (result && store) {
        store.principal = { userId: result.user.id.value, sessionId: result.session.id.value, role: result.user.role.value };
        // Sliding expiry: the row was extended, so extend the cookie too.
        if (result.refreshed) pendingCookie = serializeSessionCookie(token, result.session.expiresAt);
      } else if (!result) {
        // Expired, revoked or forged: drop it so the browser stops sending it.
        pendingCookie = serializeClearedSessionCookie();
      }
    }
    await next();
    // Login/logout may replace or clear the cookie. Never let an old refresh/cleanup overwrite that decision.
    if (pendingCookie && !c.res.headers.getSetCookie().some((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))) {
      c.header("set-cookie", pendingCookie, { append: true });
    }
  });
