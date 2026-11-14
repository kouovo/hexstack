import { subscribe } from "@app/application";
import { OUTBOX_TOPIC as OUTBOX } from "@app/persistence";
import { z } from "@app/zod";
import { MemoryPubSub, newMessage } from "@millstream/core";
import { defineEvent, EventBus } from "@millstream/cqrs";
import { ForwarderPublisher } from "@millstream/forwarder";
import { afterEach, expect, test, vi } from "vitest";

import { MillstreamDomainEventPipeline } from "./domain-event-pipeline";

// The relay hardwires Postgres; swap the outbox for an in-memory Pub/Sub.
const transports = vi.hoisted(() => ({
  outbox: undefined as never,
  logger: undefined as never,
}));
vi.mock("@app/persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/persistence")>()),
  createMillstreamDriver: () => ({}),
}));
vi.mock("@app/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/logger")>()),
  toFieldsLogger: () => transports.logger,
}));
vi.mock("@millstream/pg", () => ({
  PgQueueSubscriber: class {
    constructor() {
      return transports.outbox;
    }
  },
}));

const ThingDone = defineEvent("test.thing-done.v1", z.object({ thingId: z.string(), doneAt: z.coerce.date<Date>() }));
const ThingGone = defineEvent("test.thing-gone.v1", z.object({ thingId: z.string() }));

// The relay only reads subscription names; handlers run in the worker.
class NoopHandler {
  handle() {}
}

let pipeline: MillstreamDomainEventPipeline | undefined;
afterEach(async () => {
  await pipeline?.close();
  pipeline = undefined;
});

async function setup() {
  // Nacked messages are redelivered, like the SQL outbox does; the delay keeps the loop from spinning.
  const outbox = new MemoryPubSub({ nackResendMs: 20 });
  const dispatcher = { enqueue: vi.fn(async () => {}), registerJob: vi.fn(), scheduleRepeat: vi.fn(), unscheduleRepeat: vi.fn() };
  const logger = { debug: vi.fn(), info: vi.fn(), error: vi.fn() };
  Object.assign(transports, { outbox, logger });
  pipeline = new MillstreamDomainEventPipeline(
    undefined as never, // the database is only reached through the mocked outbox subscriber
    [subscribe(ThingDone, "billing", NoopHandler), subscribe(ThingDone, "email", NoopHandler), subscribe(ThingGone, "audit", NoopHandler)],
    dispatcher,
  );
  await pipeline.start();
  return {
    // What the business transaction writes: a millstream EventBus over the forwarder outbox.
    events: new EventBus({ publisher: new ForwarderPublisher(outbox, OUTBOX) }),
    rawOutbox: outbox,
    dispatcher,
    logger,
  };
}

test("fans an outbox event out to every subscription to it, with a job id derived from the event id", async () => {
  const s = await setup();
  const doneAt = new Date("2024-01-01T00:00:00.000Z");

  await s.events.publishMany([ThingDone.of({ thingId: "t1", doneAt }, { uuid: "event_1" })]);

  await vi.waitFor(() => expect(s.dispatcher.enqueue).toHaveBeenCalledTimes(2));
  const data = { eventId: "event_1", payload: { thingId: "t1", doneAt: doneAt.toISOString() } };
  expect(s.dispatcher.enqueue).toHaveBeenCalledWith(
    "billing",
    expect.objectContaining(data),
    expect.objectContaining({ jobId: "billing__event_1" }),
  );
  expect(s.dispatcher.enqueue).toHaveBeenCalledWith(
    "email",
    expect.objectContaining(data),
    expect.objectContaining({ jobId: "email__event_1" }),
  );
});

test("a failed enqueue leaves the event in the outbox and retries it", async () => {
  const s = await setup();
  s.dispatcher.enqueue.mockRejectedValueOnce(new Error("redis down"));

  await s.events.publishMany([ThingGone.of({ thingId: "t1" }, { uuid: "event_1" })]);

  await vi.waitFor(() => expect(s.dispatcher.enqueue).toHaveBeenCalledTimes(2));
  expect(s.dispatcher.enqueue.mock.calls[1]).toEqual(s.dispatcher.enqueue.mock.calls[0]);
});

test("an event without an outbox subscription is not relayed (stays in the outbox) instead of being dropped", async () => {
  const s = await setup();
  const Unknown = defineEvent("test.unknown.v1");

  await s.events.publishMany([Unknown.of({}, { uuid: "event_1" })]);

  await vi.waitFor(() =>
    expect(s.logger.error).toHaveBeenCalledWith("handler failed, nacking", expect.objectContaining({ handler: "outbox-relay" })),
  );
  expect(s.dispatcher.enqueue).not.toHaveBeenCalled();
});

test("a row that is not an envelope is dropped so it cannot block the outbox", async () => {
  const s = await setup();

  await s.rawOutbox.publish(OUTBOX, newMessage("not an envelope"));
  await s.events.publishMany([ThingGone.of({ thingId: "t2" })]);

  await vi.waitFor(() => expect(s.dispatcher.enqueue).toHaveBeenCalledOnce());
  expect(s.dispatcher.enqueue).toHaveBeenCalledWith("audit", expect.objectContaining({ payload: { thingId: "t2" } }), expect.anything());
});
