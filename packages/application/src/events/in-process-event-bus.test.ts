import { z } from "@app/zod";
import { defineEvent } from "@millstream/cqrs";
import { expect, test, vi } from "vitest";

import { InProcessEventBus } from "./in-process-event-bus";
import { type EventHandler, subscribe } from "./subscription";
import { DURABLE_EVENT_SUBSCRIPTIONS, IN_PROCESS_EVENT_SUBSCRIPTIONS } from "./subscriptions";

const ThingHappened = defineEvent("test.thing-happened.v1", z.object({ id: z.string(), at: z.coerce.date<Date>() }));
const OtherThing = defineEvent("test.other-thing.v1", z.object({ id: z.string() }));

const calls: string[] = [];
class OnThing implements EventHandler<{ id: string; at: Date }> {
  handle = vi.fn((event: { id: string; at: Date }) => void calls.push(`thing:${event.id}`));
}
class OnThingToo implements EventHandler<{ id: string; at: Date }> {
  bus?: InProcessEventBus;
  handle = vi.fn(async (event: { id: string; at: Date }) => {
    calls.push(`thing-too:${event.id}`);
    // Re-entrant publish: delivered after this handler returns, without deadlocking.
    await this.bus?.publishMany([OtherThing.of({ id: event.id })]);
    calls.push(`thing-too-done:${event.id}`);
  });
}
class OnOther implements EventHandler<{ id: string }> {
  handle = vi.fn((event: { id: string }) => void calls.push(`other:${event.id}`));
}

function setup() {
  calls.length = 0;
  const handlers = new Map<unknown, unknown>([
    [OnThing, new OnThing()],
    [OnThingToo, new OnThingToo()],
    [OnOther, new OnOther()],
  ]);
  const bus = new InProcessEventBus(
    [
      subscribe(ThingHappened, "thing", OnThing),
      subscribe(ThingHappened, "thing-too", OnThingToo),
      subscribe(OtherThing, "other", OnOther),
    ],
    (handler) => handlers.get(handler) as never,
  );
  return {
    bus,
    onThing: handlers.get(OnThing) as OnThing,
    onThingToo: handlers.get(OnThingToo) as OnThingToo,
    onOther: handlers.get(OnOther) as OnOther,
  };
}

test("publishMany resolves after every subscribed handler ran; payloads are validated and coerced", async () => {
  const s = setup();
  const at = new Date("2024-01-01T00:00:00.000Z");
  await s.bus.publishMany([ThingHappened.of({ id: "t1", at }, { uuid: "event_1" })]);

  expect(s.onThing.handle).toHaveBeenCalledExactlyOnceWith({ id: "t1", at }, { id: "event_1", correlationId: undefined });
  expect(s.onThing.handle.mock.calls[0]![0].at).toBeInstanceOf(Date); // JSON string → Date via the schema
  expect(s.onThingToo.handle).toHaveBeenCalledOnce();
  expect(s.onOther.handle).not.toHaveBeenCalled();
  await s.bus.close();
});

test("an invalid payload is rejected at publish time", async () => {
  const s = setup();
  await expect(s.bus.publishMany([ThingHappened.of({ id: 1 as never, at: new Date() })])).rejects.toThrow();
  expect(s.onThing.handle).not.toHaveBeenCalled();
  await s.bus.close();
});

test("a failing handler is dropped: the others still run and publish resolves", async () => {
  const s = setup();
  s.onThing.handle.mockImplementationOnce(() => {
    throw new Error("boom");
  });
  await expect(s.bus.publishMany([ThingHappened.of({ id: "t1", at: new Date() })])).resolves.toBeDefined();
  expect(s.onThingToo.handle).toHaveBeenCalledOnce();

  await s.bus.publishMany([ThingHappened.of({ id: "t2", at: new Date() })]);
  expect(s.onThing.handle).toHaveBeenCalledTimes(2);
  await s.bus.close();
});

test("events published from a handler are delivered after it, without deadlocking", async () => {
  const s = setup();
  s.onThingToo.bus = s.bus;
  await s.bus.publishMany([ThingHappened.of({ id: "t1", at: new Date() })]);
  await vi.waitFor(() => expect(s.onOther.handle).toHaveBeenCalledOnce());
  expect(calls.indexOf("thing-too-done:t1")).toBeLessThan(calls.indexOf("other:t1"));
  await s.bus.close();
});

test("after close, publishing is a no-op", async () => {
  const s = setup();
  await s.bus.close();
  await s.bus.publishMany([ThingHappened.of({ id: "t1", at: new Date() })]);
  expect(s.onThing.handle).not.toHaveBeenCalled();
});

test("subscription names are unique, and durable ones are valid consumer identities", () => {
  for (const list of [IN_PROCESS_EVENT_SUBSCRIPTIONS, DURABLE_EVENT_SUBSCRIPTIONS]) {
    const names = list.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
  }
  for (const { name } of DURABLE_EVENT_SUBSCRIPTIONS) expect(name).not.toContain(":");
});
