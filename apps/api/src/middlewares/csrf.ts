import { ForbiddenException } from "@app/domain";
import { createMiddleware } from "hono/factory";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie auth (SameSite=Lax is one layer; this is the second).
 * Unsafe methods must come from this origin or a trusted origin:
 *   1. `Sec-Fetch-Site: same-origin` (set by modern browsers) -> allow.
 *   2. Else `Origin` must be this server's origin or in `trustedOrigins` (the web app) -> allow.
 *   3. No `Origin` and no cross-site signal -> a non-browser client (curl, server-to-server) carries no
 *      ambient cookies, so CSRF does not apply -> allow.
 * Never use GET for state changes: oRPC mutations are POST.
 */
export const csrf = ({ trustedOrigins }: { trustedOrigins: readonly string[] }) =>
  createMiddleware(async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();

    const site = c.req.header("sec-fetch-site");
    const origin = c.req.header("origin");
    const allowed =
      site === "same-origin" ||
      (origin !== undefined
        ? origin === new URL(c.req.url).origin || trustedOrigins.includes(origin)
        : site === undefined || site === "none");

    if (!allowed) {
      throw new ForbiddenException("Cross-site request blocked");
    }
    await next();
  });
