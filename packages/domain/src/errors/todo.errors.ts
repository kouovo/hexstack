import { DomainError } from "@app/core";

import type { TodoStatusValue } from "../todo/todo-status.value-object";

export class TodoIdRequiredError extends DomainError<"TodoIdRequiredError"> {
  readonly _tag = "TodoIdRequiredError";
  readonly kind = "validation";
  readonly field = "todoId";
  constructor() {
    super("Todo ID is required");
  }
}

export class TodoTitleInvalidError extends DomainError<"TodoTitleInvalidError"> {
  readonly _tag = "TodoTitleInvalidError";
  readonly kind = "validation";
  readonly minLength = 1;
  readonly maxLength = 200;
  constructor(readonly length: number) {
    super("Todo title must be 1-200 characters");
  }
}

export class TodoStatusInvalidError extends DomainError<"TodoStatusInvalidError"> {
  readonly _tag = "TodoStatusInvalidError";
  readonly kind = "validation";
  constructor(readonly status: string) {
    super(`Unknown todo status "${status}"`);
  }
}

export type TodoValidationError = TodoIdRequiredError | TodoTitleInvalidError | TodoStatusInvalidError;

export class TodoNotFoundError extends DomainError<"TodoNotFoundError"> {
  readonly _tag = "TodoNotFoundError";
  readonly kind = "not-found";
  readonly todoId: string;
  constructor(args: { todoId: string }) {
    super(`Todo ${args.todoId} was not found; it may have been deleted or the id is wrong. Nothing was changed.`);
    this.todoId = args.todoId;
  }
}

export class TodoModifiedConcurrentlyError extends DomainError<"TodoModifiedConcurrentlyError"> {
  readonly _tag = "TodoModifiedConcurrentlyError";
  readonly kind = "conflict";
  readonly todoId: string;
  readonly expectedStatus: TodoStatusValue;
  constructor(args: { todoId: string; expectedStatus: TodoStatusValue }) {
    super(
      `Todo ${args.todoId} was no longer "${args.expectedStatus}" when saving; a concurrent request changed it first. This transaction was rolled back; reload and retry.`,
    );
    this.todoId = args.todoId;
    this.expectedStatus = args.expectedStatus;
  }
}

export type ChangeTodoStatusError = TodoNotFoundError | TodoTransitionNotAllowedError | TodoModifiedConcurrentlyError;
export type TodoError = ChangeTodoStatusError | TodoValidationError;

export class TodoTransitionNotAllowedError extends DomainError<"TodoTransitionNotAllowedError"> {
  readonly _tag = "TodoTransitionNotAllowedError";
  readonly kind = "conflict";
  readonly todoId: string;
  readonly from: TodoStatusValue;
  readonly to: TodoStatusValue;

  constructor(args: { todoId: string; from: TodoStatusValue; to: TodoStatusValue }) {
    super(`Cannot change todo ${args.todoId} from "${args.from}" to "${args.to}"; reload the todo before retrying.`);
    this.todoId = args.todoId;
    this.from = args.from;
    this.to = args.to;
  }
}
