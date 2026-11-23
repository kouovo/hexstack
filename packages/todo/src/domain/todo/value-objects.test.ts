import { expect, test } from "vitest";

import { TodoId } from "./todo-id.value-object";
import { TodoStatus } from "./todo-status.value-object";
import { TodoTitle } from "./todo-title.value-object";

const cases = [
  [TodoId.create(" todo_1 "), "todo_1"],
  [TodoTitle.create(" ship it "), "ship it"],
  [TodoStatus.create("completed"), "completed"],
] as const;

test.each(cases)("value objects explicitly expose their value and public serialization (%#)", (value, expected) => {
  expect(value.value).toBe(expected);
  expect(String(value)).toBe(expected);
  expect(value.toJSON()).toBe(expected);
  expect(JSON.parse(JSON.stringify(value))).toBe(expected);
});

test("explicit value access does not change equality", () => {
  expect(TodoTitle.create(" ship ").equals(TodoTitle.create("ship"))).toBe(true);
  expect(TodoStatus.create("open").equals(TodoStatus.create("archived"))).toBe(false);
});
