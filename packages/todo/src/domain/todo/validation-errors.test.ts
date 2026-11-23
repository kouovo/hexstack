import { DomainError } from "@app/common/ddd";
import { expect, test } from "vitest";

import { TodoId } from "./todo-id.value-object";
import { TodoStatus } from "./todo-status.value-object";
import { TodoTitle } from "./todo-title.value-object";
import { TodoIdRequiredError, TodoStatusInvalidError, TodoTitleInvalidError } from "./todo.errors";

const cases = [
  [() => TodoId.create(" "), TodoIdRequiredError, { field: "todoId" }],
  [() => TodoTitle.create(" "), TodoTitleInvalidError, { length: 0, minLength: 1, maxLength: 200 }],
  [() => TodoTitle.create("x".repeat(201)), TodoTitleInvalidError, { length: 201 }],
  [() => TodoStatus.create("paused"), TodoStatusInvalidError, { status: "paused" }],
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
