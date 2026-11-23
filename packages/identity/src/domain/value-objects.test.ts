import { expect, test } from "vitest";

import { SessionId } from "./session/session.entity";
import { PasswordHash } from "./user/password-hash.value-object";
import { Password } from "./user/password.value-object";
import { UserEmail } from "./user/user-email.value-object";
import { UserId } from "./user/user-id.value-object";
import { UserRole } from "./user/user-role.value-object";

const cases = [
  [UserId.create(" usr_1 "), "usr_1"],
  [SessionId.rehydrate("sess_1"), "sess_1"],
  [UserEmail.create(" Ada@Example.com "), "ada@example.com"],
  [UserRole.create("member"), "member"],
] as const;

test.each(cases)("value objects explicitly expose their value and public serialization (%#)", (value, expected) => {
  expect(value.value).toBe(expected);
  expect(String(value)).toBe(expected);
  expect(value.toJSON()).toBe(expected);
  expect(JSON.parse(JSON.stringify(value))).toBe(expected);
});

test("explicit value access does not change equality", () => {
  expect(UserEmail.create("ADA@example.com").equals(UserEmail.create("ada@example.com"))).toBe(true);
  expect(UserRole.create("member").equals(UserRole.create("viewer"))).toBe(false);
});

test("passwords and hashes retain their separate redacted representations", () => {
  for (const value of [Password.create("private password"), PasswordHash.create("$private$hash")]) {
    expect(String(value)).not.toContain("private");
    expect(JSON.stringify(value)).not.toContain("private");
  }
});
