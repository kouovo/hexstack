import { DOMAIN_EVENT_OUTBOX, SESSION_REPO, TODO_REPO, USER_REPO } from "@app/application";
import { container, instanceCachingFactory } from "@app/di";

import { createOutboxEventBus } from "./outbox/domain-event-outbox";
import { SessionRepository } from "./session/session.repository";
import { TodoRepository } from "./todo/todo.repository";
import { type ITransactionManager, TRANSACTION_MANAGER } from "./transaction";
import { UserRepository } from "./user/user.repository";

export function registerRepositories() {
  container.register(DOMAIN_EVENT_OUTBOX, {
    useFactory: instanceCachingFactory((c) => createOutboxEventBus(c.resolve<ITransactionManager>(TRANSACTION_MANAGER))),
  });
  container.registerSingleton(TODO_REPO, TodoRepository);
  container.registerSingleton(USER_REPO, UserRepository);
  container.registerSingleton(SESSION_REPO, SessionRepository);
}
