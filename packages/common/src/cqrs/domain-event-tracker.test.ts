import { defineEvent, type EventItem } from "@millstream/cqrs";
import { expect, test, vi } from "vitest";

import { z } from "../zod";
import { DomainEventTracker, type DomainEventSource } from "./domain-event-tracker";
import { FakeApplicationTransaction } from "./testing";

const TodoCreatedEvent = defineEvent("test.todo-created.v1", z.object({ todoId: z.string(), title: z.string() }));
const TodoCompletedEvent = defineEvent("test.todo-completed.v1", z.object({ todoId: z.string(), completedAt: z.coerce.date<Date>() }));

/** Minimal aggregate: records events, hands them out once. */
class Recorder implements DomainEventSource {
  private events: EventItem[] = [];
  created(todoId: string) {
    this.events.push(TodoCreatedEvent.of({ todoId, title: "t" }, { uuid: `created_${todoId}` }));
  }
  completed(todoId: string) {
    this.events.push(TodoCompletedEvent.of({ todoId, completedAt: new Date() }, { uuid: `completed_${todoId}` }));
  }
  hasDomainEvents() {
    return this.events.length > 0;
  }
  clearDomainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }
}

const ids = (events: readonly EventItem[]) => events.map(({ uuid }) => uuid).join(",");

function setup() {
  const log: string[] = [];
  const transaction = new FakeApplicationTransaction(log);
  const outbox = { publishMany: vi.fn(async (events: readonly EventItem[]) => void log.push(`outbox:${ids(events)}`)) };
  const bus = { publishMany: vi.fn(async (events: readonly EventItem[]) => void log.push(`bus:${ids(events)}`)) };
  return { log, transaction, outbox, bus, tracker: new DomainEventTracker(transaction, outbox, bus, new Set([TodoCompletedEvent.name])) };
}

test("durable events go to the outbox inside the transaction; all events are broadcast after commit", async () => {
  const s = setup();
  const a = new Recorder();
  const b = new Recorder();

  const result = await s.transaction.run(async () => {
    a.created("a");
    s.tracker.track(a, b, a); // duplicates are collected once
    b.completed("b"); // recorded after track(): still collected
    return "done";
  });

  expect(result).toBe("done");
  // Only TodoCompletedEvent has an outbox subscription, so only it is written to the outbox.
  expect(s.log).toEqual(["outbox:completed_b", "commit", "bus:created_a,completed_b"]);
  expect(a.hasDomainEvents()).toBe(false);
});

test("a throw rolls back: nothing written or broadcast", async () => {
  const s = setup();
  const a = new Recorder();
  await expect(
    s.transaction.run(async () => {
      a.completed("a");
      s.tracker.track(a);
      throw new Error("rule broken");
    }),
  ).rejects.toThrow("rule broken");
  expect(s.log).toEqual(["rollback"]);
  expect(s.bus.publishMany).not.toHaveBeenCalled();
});

test("an outbox failure rolls the transaction back", async () => {
  const s = setup();
  s.outbox.publishMany.mockRejectedValueOnce(new Error("outbox down"));
  const a = new Recorder();
  await expect(s.transaction.run(async () => (a.completed("a"), s.tracker.track(a)))).rejects.toThrow("outbox down");
  expect(s.log).toEqual(["rollback"]);
});

test("a broadcast failure cannot fail the committed operation", async () => {
  const s = setup();
  s.bus.publishMany.mockRejectedValueOnce(new Error("bus down"));
  const a = new Recorder();
  await expect(s.transaction.run(async () => (a.created("a"), s.tracker.track(a), 42))).resolves.toBe(42);
});

test("nothing tracked or no events: no outbox write, no broadcast", async () => {
  const s = setup();
  await s.transaction.run(async () => {});
  await s.transaction.run(async () => s.tracker.track(new Recorder()));
  expect(s.outbox.publishMany).not.toHaveBeenCalled();
  expect(s.bus.publishMany).not.toHaveBeenCalled();
});

test("a nested run joins the outer one: events published once, after the outer commit", async () => {
  const s = setup();
  const outer = new Recorder();
  const inner = new Recorder();

  await s.transaction.run(async () => {
    outer.created("o");
    s.tracker.track(outer);
    await s.transaction.run(async () => (inner.completed("i"), s.tracker.track(inner)));
    expect(s.log).toEqual([]); // nothing written or broadcast by the inner run
  });

  expect(s.transaction.runs).toHaveLength(1);
  expect(s.log).toEqual(["outbox:completed_i", "commit", "bus:created_o,completed_i"]);
});

test("an inner throw caught by the outer run still commits its writes, so its events go out too", async () => {
  const s = setup();
  const inner = new Recorder();
  await s.transaction.run(async () => {
    await s.transaction
      .run(async () => {
        inner.completed("i");
        s.tracker.track(inner);
        throw new Error("inner failed");
      })
      .catch(() => undefined);
  });
  expect(s.log).toEqual(["outbox:completed_i", "commit", "bus:completed_i"]);
});

test("each outermost transaction collects its own aggregates", async () => {
  const s = setup();
  const a = new Recorder();
  const b = new Recorder();
  await Promise.all([
    s.transaction.run(async () => (a.created("a"), s.tracker.track(a))),
    s.transaction.run(async () => (b.created("b"), s.tracker.track(b))),
  ]);
  expect(s.log.filter((entry) => entry.startsWith("bus:")).toSorted()).toEqual(["bus:created_a", "bus:created_b"]);
});

test("persisting an aggregate with events outside a transaction throws; without events it is a no-op", () => {
  const s = setup();
  const a = new Recorder();
  expect(() => s.tracker.track(a)).not.toThrow();
  a.created("a");
  expect(() => s.tracker.track(a)).toThrow(/outside a transaction/);
});
