import { singleton } from "@app/di";
import type { UserRoleChangedEvent } from "@app/domain";
import { createLogger } from "@app/logger";

import type { EventHandler, EventMeta } from "../../events/subscription";

@singleton()
export class UserRoleChangedLogEventHandler implements EventHandler<UserRoleChangedEvent> {
  private readonly logger = createLogger(UserRoleChangedLogEventHandler.name);

  handle(event: UserRoleChangedEvent, meta: EventMeta): void {
    this.logger.info({ userId: event.userId, from: event.previousRole, to: event.role, eventId: meta.id }, "user role changed");
  }
}
