import type { BoundedContext } from "@app/common/service";

import { TodoRepository } from "../adapters/todo.repository";
import { TODO_REPO } from "../adapters/todo.repository";
import { TODO_HANDLERS } from "../app/app";
import { TODO_SUBSCRIPTIONS } from "../ports/events";
import { TODO_PUBLIC_ERRORS } from "../ports/public-errors";

export const todoContext: BoundedContext = {
  name: "todo",
  registerAdapters(container) {
    container.registerSingleton(TODO_REPO, TodoRepository);
  },
  handlers: TODO_HANDLERS,
  subscriptions: TODO_SUBSCRIPTIONS,
  publicErrors: TODO_PUBLIC_ERRORS,
};
