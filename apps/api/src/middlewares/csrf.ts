import { ForbiddenException } from "@app/domain";
import { createMiddleware } from "hono/factory";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Second CSRF layer after SameSite=Lax. No `Origin` and no cross-site signal means a non-browser client, which
 * carries no ambient cookies, so it is allowed. Never use GET for state changes.
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
