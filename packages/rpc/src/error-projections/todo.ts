import type { TodoError } from "@app/domain";

import type { PublicErrorMap } from "./types";

export const TODO_PUBLIC_ERRORS = {
  TodoNotFoundError: (error) => ({
    _tag: error._tag,
    message: "This todo no longer exists. Refresh the list.",
    metadata: { todoId: error.todoId },
  }),
  TodoTransitionNotAllowedError: (error) => ({
    _tag: error._tag,
    message: `This todo is already ${error.from}, so it can't be ${error.to === "completed" ? "completed" : "archived"}. Refresh to see its current state.`,
    metadata: { todoId: error.todoId, from: error.from, to: error.to },
  }),
  TodoModifiedConcurrentlyError: (error) => ({
    _tag: error._tag,
    message: "Someone else changed this todo at the same time. Refresh and try again.",
    metadata: { todoId: error.todoId },
  }),
  TodoIdRequiredError: (error) => ({ _tag: error._tag, message: "Todo ID is required." }),
  TodoTitleInvalidError: (error) => ({
    _tag: error._tag,
    message: "Todo title must be 1-200 characters.",
    metadata: { minLength: error.minLength, maxLength: error.maxLength },
  }),
  TodoStatusInvalidError: (error) => ({ _tag: error._tag, message: "Todo status must be open, completed or archived." }),
} satisfies PublicErrorMap<TodoError>;
