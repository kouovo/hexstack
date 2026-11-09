import { type EventHandler, subscribe } from "@app/application";
import { z } from "@app/zod";
import { MemoryPubSub, newMessage, PermanentError, Router } from "@millstream/core";
import { defineEvent, EventBus } from "@millstream/cqrs";
import { ForwarderPublisher } from "@millstream/forwarder";
import { afterEach, expect, test, vi } from "vitest";

import { addDomainEventHandlers } from "./domain-event-router";

const OUTBOX = "outbox";
const ThingDone = defineEvent("test.thing-done.v1", z.object({ thingId: z.string(), doneAt: z.coerce.date<Date>() }));
const ThingGone = defineEvent("test.thing-gone.v1", z.object({ thingId: z.string() }));

type Done = { thingId: string; doneAt: Date };
class Billing implements EventHandler<Done> {
  handle = vi.fn(async (_event: Done) => {});
}
class Email implements EventHandler<Done> {
  handle = vi.fn(async (_event: Done) => {});
}
class Audit implements EventHandler<{ thingId: string }> {
  handle = vi.fn(async (_event: { thingId: string }) => {});
}

let router: Router | undefined;
afterEach(async () => {
  await router?.close();
  router = undefined;
});

async function setup() {
  // Nacked messages are redelivered, like the SQL outbox / broker do; the delay keeps the loop from spinning.
  const outbox = new MemoryPubSub({ nackResendMs: 20 });
  // Stand-in broker: one topic per event name; every subscription gets every message.
  const broker = new MemoryPubSub({ nackResendMs: 20 });
  const brokerPublish = vi.spyOn(broker, "publish");
  const handlers = new Map<unknown, unknown>([
    [Billing, new Billing()],
    [Email, new Email()],
    [Audit, new Audit()],
  ]);
  const logger = { debug: vi.fn(), info: vi.fn(), error: vi.fn() };
  router = new Router({ logger, closeTimeoutMs: 1_000 });
  addDomainEventHandlers(router, {
    outbox: { subscriber: outbox, topic: OUTBOX },
    broker,
    subscriptions: [subscribe(ThingDone, "billing", Billing), subscribe(ThingDone, "email", Email), subscribe(ThingGone, "audit", Audit)],
    consumerSubscriber: () => broker,
    resolve: (handler) => handlers.get(handler) as never,
  });
  void router.run();
  await router.running;
  return {
    // What the business transaction writes: a millstream EventBus over the forwarder outbox.
    events: new EventBus({ publisher: new ForwarderPublisher(outbox, OUTBOX) }),
    rawOutbox: outbox,
    broker,
    brokerPublish,
    logger,
    billing: handlers.get(Billing) as Billing,
    email: handlers.get(Email) as Email,
    audit: handlers.get(Audit) as Audit,
  };
}

test("relays an outbox event to the broker and hands every subscription the typed payload", async () => {
  const s = await setup();
  const doneAt = new Date("2024-01-01T00:00:00.000Z");

  await s.events.publishMany([ThingDone.of({ thingId: "t1", doneAt }, { uuid: "event_1", metadata: { correlation_id: "c1" } })]);

  await vi.waitFor(() => expect(s.billing.handle).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(s.email.handle).toHaveBeenCalledOnce());
  expect(s.billing.handle).toHaveBeenCalledWith({ thingId: "t1", doneAt }, { id: "event_1", correlationId: "c1" });
  // The broker message keeps the event id as its uuid (BullMQ job id → dedup on relay retries).
  expect(s.brokerPublish.mock.calls[0]![0]).toBe(ThingDone.name);
  expect(s.brokerPublish.mock.calls[0]![1]!.uuid).toBe("event_1");
  expect(s.audit.handle).not.toHaveBeenCalled();
});

test("an event without a durable subscription is not relayed (stays in the outbox) instead of being dropped", async () => {
  const s = await setup();
  const Unknown = defineEvent("test.unknown.v1");

  await s.events.publishMany([Unknown.of({}, { uuid: "event_1" })]);

  // Nacked → redelivered by the outbox transport until a process that knows the subscriptions relays it.
  await vi.waitFor(() =>
    expect(s.logger.error).toHaveBeenCalledWith("handler failed, nacking", expect.objectContaining({ handler: "outbox-relay" })),
  );
  expect(s.brokerPublish).not.toHaveBeenCalled();
});

test("a row that is not an envelope is dropped so it cannot block the outbox", async () => {
  const s = await setup();

  await s.rawOutbox.publish(OUTBOX, newMessage("not an envelope"));
  await s.events.publishMany([ThingGone.of({ thingId: "t2" })]);

  await vi.waitFor(() => expect(s.audit.handle).toHaveBeenCalledOnce());
  expect(s.brokerPublish).toHaveBeenCalledOnce();
});

test("an invalid payload on the broker is a PermanentError and never reaches the handler", async () => {
  const s = await setup();

  await s.broker.publish(ThingDone.name, newMessage(JSON.stringify({ thingId: 1 }), { name: ThingDone.name }));

  await vi.waitFor(() =>
    expect(s.logger.error).toHaveBeenCalledWith(
      "handler failed, nacking",
      expect.objectContaining({ handler: "billing", error: expect.any(PermanentError) }),
    ),
  );
  expect(s.billing.handle).not.toHaveBeenCalled();
});
