import { z } from "@app/zod";
import { defineEvent, type EventPayload } from "@millstream/cqrs";

export const UserRoleChangedEvent = defineEvent(
  "user.role-changed.v1",
  z.object({
    userId: z.string(),
    previousRole: z.string(),
    role: z.string(),
  }),
);
export type UserRoleChangedEvent = EventPayload<typeof UserRoleChangedEvent>;
