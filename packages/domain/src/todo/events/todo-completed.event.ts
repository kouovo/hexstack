import { z } from "@app/zod";
import { defineEvent, type EventPayload } from "@millstream/cqrs";

export const TodoCompletedEvent = defineEvent(
  "todo.completed.v1",
  z.object({
    todoId: z.string(),
    // JSON carries dates as strings; coerce turns them back into Date for handlers.
    completedAt: z.coerce.date<Date>(),
  }),
);
export type TodoCompletedEvent = EventPayload<typeof TodoCompletedEvent>;
