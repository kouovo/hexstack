import { z } from "@app/zod";
import { defineEvent, type EventBus } from "@millstream/cqrs";
import { expect, test, vi } from "vitest";

import { createInProcessEventBus } from "./in-process-event-bus";
import { type EventHandler, subscribe } from "./subscription";
import { IN_PROCESS_EVENT_SUBSCRIPTIONS, OUTBOX_SUBSCRIPTIONS } from "./subscriptions";

const ThingHappened = defineEvent("test.thing-happened.v1", z.object({ id: z.string(), at: z.coerce.date<Date>() }));
const OtherThing = defineEvent("test.other-thing.v1", z.object({ id: z.string() }));

const calls: string[] = [];
class OnThing implements EventHandler<{ id: string; at: Date }> {
  handle = vi.fn((event: { id: string; at: Date }): void | Promise<void> => void calls.push(`thing:${event.id}`));
}
class OnThingToo implements EventHandler<{ id: string; at: Date }> {
  bus?: EventBus;
  handle = vi.fn(async (event: { id: string; at: Date }) => {
    calls.push(`thing-too:${event.id}`);
    // Re-entrant publish: does not wait for its own delivery (it would wait for itself).
    await this.bus?.publishMany([OtherThing.of({ id: event.id })]);
    calls.push(`thing-too-done:${event.id}`);
  });
}
class OnOther implements EventHandler<{ id: string }> {
  handle = vi.fn((event: { id: string }): void | Promise<void> => void calls.push(`other:${event.id}`));
}

function setup() {
  calls.length = 0;
  const handlers = new Map<unknown, unknown>([
    [OnThing, new OnThing()],
    [OnThingToo, new OnThingToo()],
    [OnOther, new OnOther()],
  ]);
  const { bus, close } = createInProcessEventBus(
    [
      subscribe(ThingHappened, "thing", OnThing),
      subscribe(ThingHappened, "thing-too", OnThingToo),
      subscribe(OtherThing, "other", OnOther),
    ],
    (handler) => handlers.get(handler) as never,
  );
  return {
    bus,
    close,
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
  await s.close();
});

test("an invalid payload rejects the whole batch before anything is delivered", async () => {
  const s = setup();
  await expect(s.bus.publishMany([OtherThing.of({ id: "o1" }), ThingHappened.of({ id: 1 as never, at: new Date() })])).rejects.toThrow();
  expect(s.onThing.handle).not.toHaveBeenCalled();
  expect(s.onOther.handle).not.toHaveBeenCalled();
  await s.close();
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
  await s.close();
});

test("events published from a handler are delivered without deadlocking", async () => {
  const s = setup();
  s.onThingToo.bus = s.bus;
  await s.bus.publishMany([ThingHappened.of({ id: "t1", at: new Date() })]);
  await vi.waitFor(() => expect(s.onOther.handle).toHaveBeenCalledOnce());
  expect(calls).toContain("thing-too-done:t1");
  await s.close();
});

test("nothing is serialized: handlers run concurrently with themselves, across event types, batches and publishes", async () => {
  const s = setup();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  s.onThing.handle.mockImplementation(async (event) => {
    calls.push(`start:${event.id}`);
    await gate;
  });
  s.onOther.handle.mockImplementation(() => gate);
  const first = s.bus.publishMany([
    ThingHappened.of({ id: "t1", at: new Date() }),
    OtherThing.of({ id: "o1" }),
    ThingHappened.of({ id: "t2", at: new Date() }),
  ]);
  const second = s.bus.publishMany([ThingHappened.of({ id: "t3", at: new Date() })]);
  await vi.waitFor(() => {
    expect(s.onThing.handle).toHaveBeenCalledTimes(3);
    expect(s.onOther.handle).toHaveBeenCalledOnce();
  });
  release();
  await Promise.all([first, second]);
  await s.close();
});

test("after close, publishing rejects and delivers nothing", async () => {
  const s = setup();
  await s.close();
  await expect(s.bus.publishMany([ThingHappened.of({ id: "t1", at: new Date() })])).rejects.toThrow();
  expect(s.onThing.handle).not.toHaveBeenCalled();
});

test("subscription names are unique", () => {
  for (const subscriptions of [IN_PROCESS_EVENT_SUBSCRIPTIONS, OUTBOX_SUBSCRIPTIONS]) {
    const names = subscriptions.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
  }
});

test("handlers do not inherit the async context of whoever built the bus or published", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const ambient = new AsyncLocalStorage<string>();
  const seen: (string | undefined)[] = [];
  const s = ambient.run("builder", () => setup());
  s.onThing.handle.mockImplementation(() => void seen.push(ambient.getStore()));
  await ambient.run("publisher", () => s.bus.publishMany([ThingHappened.of({ id: "t1", at: new Date() })]));
  expect(seen).toEqual([undefined]);
  await s.close();
});
