import { createHash } from "node:crypto";

import { stableStringify } from "../cache/stable-stringify";

/** Every input that changes the result must be part of the key. Hashed so keys stay short and opaque. */
export function todoListQueryKey(input: { status?: string | undefined; limit: number }): string {
  return createHash("sha1")
    .update(stableStringify({ status: input.status ?? null, limit: input.limit }))
    .digest("hex")
    .slice(0, 16);
}
