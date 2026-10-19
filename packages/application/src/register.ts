import { CommandBus, EventBus, QueryBus } from "@app/cqrs";
import { container } from "@app/di";

import { SignInCommandHandler, SignOutAllCommandHandler, SignOutCommandHandler, SignUpCommandHandler } from "./auth/commands";
import { GetCurrentUserQueryHandler } from "./auth/queries";
import { ArchiveTodoCommandHandler, CompleteTodoCommandHandler, CreateTodoCommandHandler } from "./todo/commands";
import {
  TodoArchivedLogEventHandler,
  TodoCompletedLogEventHandler,
  TodoCreatedLogEventHandler,
  TodoArchivedCacheEventHandler,
  TodoCompletedCacheEventHandler,
  TodoCreatedCacheEventHandler,
} from "./todo/events";
import { ListTodosQueryHandler } from "./todo/queries";
import { AssignRoleCommandHandler } from "./user/commands";
import { UserRoleChangedLogEventHandler } from "./user/events";
import { ListUsersQueryHandler } from "./user/queries";

/**
 * Command/query handlers and in-process event handlers for every bounded context.
 * Ports they inject must be registered first. Durable (outbox) consumers are registered separately
 * in register-application-outbox-handlers.ts.
 */
export function registerDomainCqrsHandlers(): void {
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
  container
    .resolve(EventBus)
    .register([
      TodoCreatedLogEventHandler,
      TodoCompletedLogEventHandler,
      TodoArchivedLogEventHandler,
      UserRoleChangedLogEventHandler,
      TodoCreatedCacheEventHandler,
      TodoCompletedCacheEventHandler,
      TodoArchivedCacheEventHandler,
    ]);
}
