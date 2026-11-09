import { z } from "@app/zod";
import { defineEvent, type EventPayload } from "@millstream/cqrs";

export const UserSignedUpEvent = defineEvent(
  "user.signed-up.v1",
  z.object({
    userId: z.string(),
    email: z.string(),
  }),
);
export type UserSignedUpEvent = EventPayload<typeof UserSignedUpEvent>;
