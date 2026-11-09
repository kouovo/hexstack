import { CommandBus, QueryBus } from "@app/cqrs";
import { container, instanceCachingFactory } from "@app/di";

import { SignInCommandHandler, SignOutAllCommandHandler, SignOutCommandHandler, SignUpCommandHandler } from "./auth/commands";
import { GetCurrentUserQueryHandler } from "./auth/queries";
import { InProcessEventBus } from "./events/in-process-event-bus";
import { DOMAIN_EVENT_BUS } from "./events/port";
import { IN_PROCESS_EVENT_SUBSCRIPTIONS } from "./events/subscriptions";
import { ArchiveTodoCommandHandler, CompleteTodoCommandHandler, CreateTodoCommandHandler } from "./todo/commands";
import { ListTodosQueryHandler } from "./todo/queries";
import { AssignRoleCommandHandler } from "./user/commands";
import { ListUsersQueryHandler } from "./user/queries";

/**
 * Command/query handlers for every bounded context, plus the in-process event bus they publish to.
 * Ports they inject must be registered first. Event handlers are listed in events/subscriptions.ts; the durable
 * ones are run by the pipeline in @app/pubsub.
 */
export function registerDomainCqrsHandlers(): void {
  container.register(DOMAIN_EVENT_BUS, {
    useFactory: instanceCachingFactory((c) => new InProcessEventBus(IN_PROCESS_EVENT_SUBSCRIPTIONS, (handler) => c.resolve(handler))),
  });
  container
    .resolve(CommandBus)
    .register([
      CreateTodoCommandHandler,
      CompleteTodoCommandHandler,
      ArchiveTodoCommandHandler,
      SignUpCommandHandler,
      SignInCommandHandler,
      SignOutCommandHandler,
      SignOutAllCommandHandler,
      AssignRoleCommandHandler,
    ]);
  container.resolve(QueryBus).register([ListTodosQueryHandler, ListUsersQueryHandler, GetCurrentUserQueryHandler]);
}
