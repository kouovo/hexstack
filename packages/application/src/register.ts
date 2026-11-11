import { container } from "@app/di";

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
import { createInProcessEventBus } from "./events/in-process-event-bus";
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

/** Register the ports the handlers inject first. */
export function registerDomainCqrsHandlers(): void {
  const { bus } = createInProcessEventBus(IN_PROCESS_EVENT_SUBSCRIPTIONS, (handler) => container.resolve(handler));
  container.registerInstance(DOMAIN_EVENT_BUS, bus);
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
