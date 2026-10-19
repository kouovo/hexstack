import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Session token = `<id>.<secret>`.
 * - id: identifies the row and can be logged / referenced without leaking a credential.
 * - secret: 32 random bytes (CSPRNG); only its SHA-256 is stored, so a DB leak yields no usable token.
 * A fast hash is fine here (unlike passwords) because the secret has 256 bits of entropy.
 */
const ID_BYTES = 15; // 120 bits, 20 base64url chars
const SECRET_BYTES = 32;
const ID_PATTERN = /^[A-Za-z0-9_-]{20}$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface GeneratedSessionToken {
  id: string;
  token: string;
  secretHash: string;
}

export function generateSessionToken(): GeneratedSessionToken {
  const id = randomBytes(ID_BYTES).toString("base64url");
  const secret = randomBytes(SECRET_BYTES);
  return { id, token: `${id}.${secret.toString("base64url")}`, secretHash: hashSessionSecret(secret) };
}

export function hashSessionSecret(secret: Uint8Array): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Returns null for anything that is not exactly `<id>.<secret>` in the expected encoding. */
export function parseSessionToken(token: string): { id: string; secret: Buffer } | null {
  if (token.length !== 64) return null;
  const [id, secret, ...rest] = token.split(".");
  if (rest.length > 0 || !id || !secret || !ID_PATTERN.test(id) || !SECRET_PATTERN.test(secret)) return null;
  const bytes = Buffer.from(secret, "base64url");
  if (bytes.toString("base64url") !== secret) return null; // reject non-canonical padding bits
  return { id, secret: bytes };
}

/** Constant-time comparison of two hex digests. */
export function secretHashMatches(expectedHex: string, secret: Uint8Array): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(hashSessionSecret(secret), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
