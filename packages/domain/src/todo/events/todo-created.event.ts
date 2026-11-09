import { z } from "@app/zod";
import { defineEvent, type EventPayload } from "@millstream/cqrs";

/** The name is the wire contract (topic, BullMQ queue, stored outbox rows): never change it, version it instead. */
export const TodoCreatedEvent = defineEvent(
  "todo.created.v1",
  z.object({
    todoId: z.string(),
    title: z.string(),
  }),
);
export type TodoCreatedEvent = EventPayload<typeof TodoCreatedEvent>;
