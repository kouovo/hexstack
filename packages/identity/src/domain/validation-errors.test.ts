import { DomainError } from "@app/common/ddd";
import { expect, test } from "vitest";

import { PasswordHash } from "./user/password-hash.value-object";
import { UserEmail } from "./user/user-email.value-object";
import { UserId } from "./user/user-id.value-object";
import { UserRole } from "./user/user-role.value-object";
import { PasswordHashInvalidError, UserEmailInvalidError, UserIdRequiredError, UserRoleInvalidError } from "./user/user.errors";

const cases = [
  [() => UserId.create(" "), UserIdRequiredError, { field: "userId" }],
  [() => UserEmail.create("invalid"), UserEmailInvalidError, { rule: "valid-email" }],
  [() => UserRole.create("root"), UserRoleInvalidError, { role: "root" }],
  [() => PasswordHash.create("private plaintext"), PasswordHashInvalidError, { format: "PHC" }],
] as const;

test.each(cases)("invalid value throws its specific domain class (%#)", (create, ErrorClass, fields) => {
  let caught: unknown;
  try {
    create();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(DomainError);
  expect(caught).toBeInstanceOf(ErrorClass);
  expect(caught).toMatchObject({ _tag: ErrorClass.name, retryable: false, ...fields });
  expect(caught).not.toHaveProperty("code");
});

test("password hash validation does not retain or serialize supplied secrets", () => {
  try {
    PasswordHash.create("private plaintext");
  } catch (error) {
    expect(error).toBeInstanceOf(PasswordHashInvalidError);
    expect(JSON.stringify(error)).not.toContain("private plaintext");
    expect(Object.values(error as object)).not.toContain("private plaintext");
  }
});
