import { z } from "@app/zod";
import { defineEvent } from "@millstream/cqrs";
import { expect, test, vi } from "vitest";

import type { JobHandler } from "../queue/queue.port";
import { registerOutboxWorkers } from "./outbox-workers";
import { type EventHandler, subscribe } from "./subscription";

const ThingDone = defineEvent("test.thing-done.v1", z.object({ id: z.string(), at: z.coerce.date<Date>() }));

class OnThingDone implements EventHandler<{ id: string; at: Date }> {
  handle = vi.fn();
}

function setup(...subscriptions: Parameters<typeof registerOutboxWorkers>[0]) {
  const workers = new Map<string, JobHandler>();
  const dispatcher = {
    enqueue: vi.fn(),
    registerJob: vi.fn((name: string, handler: JobHandler) => void workers.set(name, handler)),
    scheduleRepeat: vi.fn(),
    unscheduleRepeat: vi.fn(),
  };
  const handler = new OnThingDone();
  registerOutboxWorkers(subscriptions, dispatcher, () => handler as never);
  return { workers, handler };
}

test("a worker parses the JSON payload with the event schema and passes the event id as meta", async () => {
  const s = setup(subscribe(ThingDone, "thing.notify", OnThingDone));
  const at = new Date("2024-01-01T00:00:00.000Z");

  await s.workers.get("thing.notify")!({ eventId: "event_1", correlationId: "corr_1", payload: { id: "t1", at: at.toISOString() } });

  expect(s.handler.handle).toHaveBeenCalledExactlyOnceWith({ id: "t1", at }, { id: "event_1", correlationId: "corr_1" });
});

test("an invalid payload fails the job instead of reaching the handler", async () => {
  const s = setup(subscribe(ThingDone, "thing.notify", OnThingDone));

  await expect(s.workers.get("thing.notify")!({ eventId: "event_1", payload: { id: 1 } })).rejects.toThrow();
  expect(s.handler.handle).not.toHaveBeenCalled();
});

test("subscription names are queue names and must be unique", () => {
  expect(() => setup(subscribe(ThingDone, "thing.notify", OnThingDone), subscribe(ThingDone, "thing.notify", OnThingDone))).toThrow(
    "already registered",
  );
});
