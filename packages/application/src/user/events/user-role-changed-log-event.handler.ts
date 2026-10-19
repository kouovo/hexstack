import { eventHandler, type IEventHandler } from "@app/cqrs";
import { singleton } from "@app/di";
import { UserRoleChangedEvent } from "@app/domain";
import { createLogger } from "@app/logger";

/** In-process audit trail for role changes. Make it an @outboxHandler if the audit log must be durable. */
@eventHandler(UserRoleChangedEvent)
@singleton()
export class UserRoleChangedLogEventHandler implements IEventHandler<UserRoleChangedEvent> {
  private readonly logger = createLogger(UserRoleChangedLogEventHandler.name);

  handle(event: UserRoleChangedEvent): void {
    this.logger.info({ userId: event.aggregateId, from: event.previousRole, to: event.role, eventId: event.id }, "user role changed");
  }
}
