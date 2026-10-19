import { env } from "@app/env";

/**
 * __Host- prevents subdomains from injecting a Domain cookie with the same name.
 * Its mandatory Secure attribute is incompatible with plain-HTTP development, so use a local-only fallback.
 */
export const SESSION_COOKIE_NAME = env.SESSION_COOKIE_SECURE ? "__Host-app_session" : "app_session";

/**
 * HttpOnly: page scripts (and malicious dependencies) cannot read the token.
 * SameSite=Lax: not sent on cross-site subrequests; CSRF is additionally checked on the server (Origin).
 * Secure: HTTPS only (Chrome/Firefox also allow http://localhost; Safari does not -> SESSION_COOKIE_SECURE=false).
 */
function attributes(maxAgeSeconds: number): string {
  return ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`, ...(env.SESSION_COOKIE_SECURE ? ["Secure"] : [])].join("; ");
}

export function serializeSessionCookie(token: string, expiresAt: Date, now = new Date()): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  return `${SESSION_COOKIE_NAME}=${token}; ${attributes(maxAge)}`;
}

export function serializeClearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; ${attributes(0)}`;
}

/** Reads the session token from a Cookie header without allocating a full parse. */
export function readSessionToken(cookieHeader: string | null | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE_NAME) return value.join("=") || undefined;
  }
  return undefined;
}
