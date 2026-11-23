import { inject } from "@app/common/di";

import type { PasswordHash } from "../domain/user/password-hash.value-object";
import type { Password } from "../domain/user/password.value-object";

/** Implementations must hash off the event loop and compare in constant time. */
export interface PasswordHasher {
  /** Only policy-checked passwords can be hashed: the type forces `Password.create()` first. */
  hash(password: Password): Promise<PasswordHash>;
  /** `candidate` is NOT policy-checked: existing users must still sign in after the policy changes. */
  verify(hash: PasswordHash, candidate: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol.for("PASSWORD_HASHER");
export const injectPasswordHasher = () => inject(PASSWORD_HASHER);
