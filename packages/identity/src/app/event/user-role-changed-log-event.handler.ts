import { singleton } from "@app/common/di";
import type { EventHandler, EventMeta } from "@app/common/events";
import { createLogger } from "@app/common/logger";

import type { UserRoleChangedEvent } from "../../domain/user/events/user-role-changed.event";

@singleton()
export class UserRoleChangedLogEventHandler implements EventHandler<UserRoleChangedEvent> {
  private readonly logger = createLogger(UserRoleChangedLogEventHandler.name);

  handle(event: UserRoleChangedEvent, meta: EventMeta): void {
    this.logger.info({ userId: event.userId, from: event.previousRole, to: event.role, eventId: meta.id }, "user role changed");
  }
}
