import { CommandBus, EventBus, QueryBus } from "@app/cqrs";
import { container } from "@app/di";

import { SignInCommandHandler, SignOutAllCommandHandler, SignOutCommandHandler, SignUpCommandHandler } from "./auth/commands";
import { GetCurrentUserQueryHandler } from "./auth/queries";
import { CacheInvalidationEventsHandler } from "./cache/events";
import { ArchiveTodoCommandHandler, CompleteTodoCommandHandler, CreateTodoCommandHandler } from "./todo/commands";
import { TodoArchivedLogEventHandler, TodoCompletedLogEventHandler, TodoCreatedLogEventHandler } from "./todo/events";
import { ListTodosQueryHandler } from "./todo/queries";
import { registerTodoCacheInvalidation } from "./todo/todo-cache-invalidation";
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
    .register([TodoCreatedLogEventHandler, TodoCompletedLogEventHandler, TodoArchivedLogEventHandler, UserRoleChangedLogEventHandler]);
}

/**
 * One global after-commit handler maps domain events to cache invalidations; each bounded context
 * contributes its rules here. Needs the CACHE port (registerCache()).
 */
export function registerCacheInvalidation(): void {
  const eventBus = container.resolve(EventBus);
  const cacheInvalidationHandler = container.resolve(CacheInvalidationEventsHandler);
  eventBus.registerGlobal(cacheInvalidationHandler);
  registerTodoCacheInvalidation(cacheInvalidationHandler);
}
