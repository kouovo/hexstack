import { container, instanceCachingFactory } from "@app/di";

import {
  SignInCommand,
  SignInCommandHandler,
  SignOutAllCommand,
  SignOutAllCommandHandler,
  SignOutCommand,
  SignOutCommandHandler,
  SignUpCommand,
  SignUpCommandHandler,
} from "./auth/commands";
import { GetCurrentUserQuery, GetCurrentUserQueryHandler } from "./auth/queries";
import { InProcessEventBus } from "./events/in-process-event-bus";
import { DOMAIN_EVENT_BUS } from "./events/port";
import { IN_PROCESS_EVENT_SUBSCRIPTIONS } from "./events/subscriptions";
import { bindHandler, MEDIATOR, Mediator } from "./shared/mediator";
import {
  ArchiveTodoCommand,
  ArchiveTodoCommandHandler,
  CompleteTodoCommand,
  CompleteTodoCommandHandler,
  CreateTodoCommand,
  CreateTodoCommandHandler,
} from "./todo/commands";
import { ListTodosQuery, ListTodosQueryHandler } from "./todo/queries";
import { AssignRoleCommand, AssignRoleCommandHandler } from "./user/commands";
import { ListUsersQuery, ListUsersQueryHandler } from "./user/queries";

/**
 * Command/query handlers for every bounded context (on a millstream `Mediator`), plus the in-process event bus they publish to.
 * Ports they inject must be registered first. Event handlers are listed in events/subscriptions.ts; the durable
 * ones are run by the pipeline in @app/pubsub.
 */
export function registerDomainCqrsHandlers(): void {
  container.register(DOMAIN_EVENT_BUS, {
    useFactory: instanceCachingFactory((c) => new InProcessEventBus(IN_PROCESS_EVENT_SUBSCRIPTIONS, (handler) => c.resolve(handler))),
  });
  // Built eagerly (like the handlers' ports): a missing binding fails at startup, not on the first request.
  const c = container;
  const mediator = new Mediator();
  bindHandler(mediator, c, CreateTodoCommand, CreateTodoCommandHandler);
  bindHandler(mediator, c, CompleteTodoCommand, CompleteTodoCommandHandler);
  bindHandler(mediator, c, ArchiveTodoCommand, ArchiveTodoCommandHandler);
  bindHandler(mediator, c, ListTodosQuery, ListTodosQueryHandler);
  bindHandler(mediator, c, SignUpCommand, SignUpCommandHandler);
  bindHandler(mediator, c, SignInCommand, SignInCommandHandler);
  bindHandler(mediator, c, SignOutCommand, SignOutCommandHandler);
  bindHandler(mediator, c, SignOutAllCommand, SignOutAllCommandHandler);
  bindHandler(mediator, c, GetCurrentUserQuery, GetCurrentUserQueryHandler);
  bindHandler(mediator, c, AssignRoleCommand, AssignRoleCommandHandler);
  bindHandler(mediator, c, ListUsersQuery, ListUsersQueryHandler);
  container.registerInstance(MEDIATOR, mediator);
}
