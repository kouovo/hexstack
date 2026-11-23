import type { EventSubscriptions } from "@app/common/events";
import { subscribe } from "@app/common/events";

import { UserRoleChangedLogEventHandler } from "../app/event/user-role-changed-log-event.handler";
import { UserRoleChangedEvent } from "../domain/user/events/user-role-changed.event";

/** Inbound event port of the identity context. */
export const IDENTITY_SUBSCRIPTIONS = {
  inProcess: [subscribe(UserRoleChangedEvent, "user.role-changed.log", UserRoleChangedLogEventHandler)],
  outbox: [],
} satisfies EventSubscriptions;
