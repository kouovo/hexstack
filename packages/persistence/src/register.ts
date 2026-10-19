import { OUTBOX_REPO, SESSION_REPO, TODO_REPO, USER_REPO } from "@app/application";
import { container } from "@app/di";

import { OutboxRepository } from "./outbox/outbox.repository";
import { SessionRepository } from "./session/session.repository";
import { TodoRepository } from "./todo/todo.repository";
import { UserRepository } from "./user/user.repository";

/** Binds every application repository port to its SQL adapter. Add one line per repository. */
export function registerRepositories() {
  container.registerSingleton(OUTBOX_REPO, OutboxRepository);
  container.registerSingleton(TODO_REPO, TodoRepository);
  container.registerSingleton(USER_REPO, UserRepository);
  container.registerSingleton(SESSION_REPO, SessionRepository);
}
