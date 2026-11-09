import { z } from "@app/zod";
import { defineEvent, type EventPayload } from "@millstream/cqrs";

export const TodoArchivedEvent = defineEvent(
  "todo.archived.v1",
  z.object({
    todoId: z.string(),
    /** Status the todo was archived from ("open" or "completed"). */
    previousStatus: z.string(),
    archivedAt: z.coerce.date<Date>(),
  }),
);
export type TodoArchivedEvent = EventPayload<typeof TodoArchivedEvent>;
