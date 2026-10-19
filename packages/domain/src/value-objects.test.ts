import { expect, test } from "vitest";

import { Password, PasswordHash, SessionId, TodoId, TodoStatus, TodoTitle, UserEmail, UserId, UserRole } from "./index";

const cases = [
  [TodoId.create(" todo_1 "), "todo_1"],
  [UserId.create(" usr_1 "), "usr_1"],
  [SessionId.rehydrate("sess_1"), "sess_1"],
  [TodoTitle.create(" ship it "), "ship it"],
  [TodoStatus.create("completed"), "completed"],
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
  expect(TodoTitle.create(" ship ").equals(TodoTitle.create("ship"))).toBe(true);
  expect(UserEmail.create("ADA@example.com").equals(UserEmail.create("ada@example.com"))).toBe(true);
  expect(UserRole.create("member").equals(UserRole.create("viewer"))).toBe(false);
});

test("passwords and hashes retain their separate redacted representations", () => {
  for (const value of [Password.create("private password"), PasswordHash.create("$private$hash")]) {
    expect(String(value)).not.toContain("private");
    expect(JSON.stringify(value)).not.toContain("private");
  }
});
