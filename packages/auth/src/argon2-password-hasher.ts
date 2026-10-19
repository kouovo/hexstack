import { argon2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import type { PasswordHasher } from "@app/application";
import { singleton } from "@app/di";
import { type Password, PasswordHash } from "@app/domain";

const argon2Async = promisify(argon2);

/** Argon2id, 16 MiB, 3 passes, parallelism 1, 16-byte salt, 32-byte tag. Raise `memory` to harden. */
export const ARGON2_PARAMS = { memory: 16 * 1024, passes: 3, parallelism: 1, tagLength: 32, saltLength: 16 } as const;

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/**
 * node:crypto's argon2 runs on the libuv threadpool (UV_THREADPOOL_SIZE, default 4), so hashing never blocks
 * the event loop. The threadpool bounds concurrent hash work; rate limits bound accepted requests.
 * Output is a PHC string, so parameters can change later without breaking stored hashes.
 */
@singleton()
export class Argon2PasswordHasher implements PasswordHasher {
  async hash(password: Password): Promise<PasswordHash> {
    const salt = randomBytes(ARGON2_PARAMS.saltLength);
    const { memory, passes, parallelism, tagLength } = ARGON2_PARAMS;
    const tag = await argon2Async("argon2id", { message: password.reveal(), nonce: salt, memory, passes, parallelism, tagLength });
    return PasswordHash.create(`$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${b64(salt)}$${b64(tag)}`);
  }

  async verify(hash: PasswordHash, candidate: string): Promise<boolean> {
    if (hash.value.length > 512) return false;
    const match = PHC.exec(hash.value);
    if (!match) return false;
    const [, m, t, p, saltB64, tagB64] = match;
    const memory = Number(m);
    const passes = Number(t);
    const parallelism = Number(p);
    const nonce = Buffer.from(saltB64!, "base64");
    const expected = Buffer.from(tagB64!, "base64");
    // Stored hashes are trusted, but a corrupt/hostile PHC string must not ask libuv for unbounded work.
    // Increase these caps deliberately if you upgrade the hashing policy beyond them.
    if (
      ![memory, passes, parallelism].every(Number.isSafeInteger) ||
      parallelism < 1 ||
      parallelism > 4 ||
      memory < 8 * parallelism ||
      memory > 65_536 ||
      passes < 1 ||
      passes > 10 ||
      nonce.length < 8 ||
      nonce.length > 64 ||
      expected.length < 16 ||
      expected.length > 64 ||
      b64(nonce) !== saltB64 ||
      b64(expected) !== tagB64
    )
      return false;
    const actual = await argon2Async("argon2id", {
      message: candidate,
      nonce,
      memory,
      passes,
      parallelism,
      tagLength: expected.length,
    });
    return timingSafeEqual(actual, expected);
  }
}

/** PHC strings use unpadded standard base64. */
const b64 = (bytes: Buffer) => bytes.toString("base64").replace(/=+$/, "");
