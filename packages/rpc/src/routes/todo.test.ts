import { type ChangeTodoStatusError, TodoModifiedConcurrentlyError, TodoNotFoundError, TodoTransitionNotAllowedError } from "@app/domain";
import { expect, test } from "vitest";

import { HTTP_STATUS, toPublicError } from "../domain-errors";

const variants: ChangeTodoStatusError[] = [
  new TodoNotFoundError({ todoId: "todo_1" }),
  new TodoTransitionNotAllowedError({ todoId: "todo_1", from: "archived", to: "completed" }),
  new TodoModifiedConcurrentlyError({ todoId: "todo_1", expectedStatus: "open" }),
];

test("every todo failure has one stable tag, an HTTP status and a user-safe message", () => {
  expect(variants.map((error) => [toPublicError(error)._tag, HTTP_STATUS[error.kind]])).toEqual([
    ["TodoNotFoundError", 404],
    ["TodoTransitionNotAllowedError", 409],
    ["TodoModifiedConcurrentlyError", 409],
  ]);
  for (const error of variants) {
    const failure = toPublicError(error);
    expect(failure.message).not.toBe(error.message);
    expect(failure.message).not.toMatch(/rolled back|todoStatusMachine|transaction/);
    expect(failure).not.toHaveProperty("code");
    expect(failure).not.toHaveProperty("dataCode");
  }
});

// @ts-expect-error -- TodoModifiedConcurrentlyError is unhandled.
const incompleteMapping: Record<ChangeTodoStatusError["_tag"], number> = {
  TodoNotFoundError: 404,
  TodoTransitionNotAllowedError: 409,
};
test("the mapping is exhaustive at compile time", () => {
  expect(incompleteMapping).toBeTypeOf("object");
});
