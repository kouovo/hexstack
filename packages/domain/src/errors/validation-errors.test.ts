import { DomainError } from "@app/core";
import { expect, test } from "vitest";

import {
  TodoId,
  TodoTitle,
  TodoStatus,
  UserId,
  UserEmail,
  UserRole,
  PasswordHash,
  TodoIdRequiredError,
  TodoTitleInvalidError,
  TodoStatusInvalidError,
  UserIdRequiredError,
  UserEmailInvalidError,
  UserRoleInvalidError,
  PasswordHashInvalidError,
} from "../index";

const cases = [
  [() => TodoId.create(" "), TodoIdRequiredError, { field: "todoId" }],
  [() => TodoTitle.create(" "), TodoTitleInvalidError, { length: 0, minLength: 1, maxLength: 200 }],
  [() => TodoTitle.create("x".repeat(201)), TodoTitleInvalidError, { length: 201 }],
  [() => TodoStatus.create("paused"), TodoStatusInvalidError, { status: "paused" }],
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
