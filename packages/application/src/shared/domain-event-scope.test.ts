import { TodoCompletedEvent, TodoCreatedEvent } from "@app/domain";
import type { EventItem } from "@millstream/cqrs";
import { expect, test, vi } from "vitest";

import type { ApplicationTransactionPort } from "../transaction";
import { DomainEventScope, type DomainEventSource } from "./domain-event-scope";

/** Minimal aggregate: records events, hands them out once. */
class Recorder implements DomainEventSource {
  private events: EventItem[] = [];
  created(todoId: string) {
    this.events.push(TodoCreatedEvent.of({ todoId, title: "t" }, { uuid: `created_${todoId}` }));
  }
  completed(todoId: string) {
    this.events.push(TodoCompletedEvent.of({ todoId, completedAt: new Date() }, { uuid: `completed_${todoId}` }));
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
  const transaction: ApplicationTransactionPort = {
    run: vi.fn(async (work) => {
      try {
        const result = await work();
        log.push("commit");
        return result;
      } catch (error) {
        log.push("rollback");
        throw error;
      }
    }),
  };
  const outbox = { publishMany: vi.fn(async (events: readonly EventItem[]) => void log.push(`outbox:${ids(events)}`)) };
  const bus = { publishMany: vi.fn(async (events: readonly EventItem[]) => void log.push(`bus:${ids(events)}`)) };
  return { log, transaction, outbox, bus, scope: new DomainEventScope(transaction, outbox, bus) };
}

test("durable events go to the outbox inside the transaction; all events are broadcast after commit", async () => {
  const s = setup();
  const a = new Recorder();
  const b = new Recorder();

  const result = await s.scope.run(async (track) => {
    a.created("a");
    track(a, b, a); // duplicates are collected once
    b.completed("b"); // recorded after track(): still collected
    return "done";
  });

  expect(result).toBe("done");
  // Only TodoCompletedEvent has a durable subscription, so only it is written to the outbox.
  expect(s.log).toEqual(["outbox:completed_b", "commit", "bus:created_a,completed_b"]);
  expect(a.clearDomainEvents()).toEqual([]);
});

test("a throw rolls back: nothing written or broadcast", async () => {
  const s = setup();
  const a = new Recorder();
  await expect(
    s.scope.run(async (track) => {
      a.completed("a");
      track(a);
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
  await expect(s.scope.run(async (track) => (a.completed("a"), track(a)))).rejects.toThrow("outbox down");
  expect(s.log).toEqual(["rollback"]);
});

test("a broadcast failure cannot fail the committed operation", async () => {
  const s = setup();
  s.bus.publishMany.mockRejectedValueOnce(new Error("bus down"));
  const a = new Recorder();
  await expect(s.scope.run(async (track) => (a.created("a"), track(a), 42))).resolves.toBe(42);
});

test("no events: no outbox write, no broadcast; transaction options pass through", async () => {
  const s = setup();
  await s.scope.run(async () => {}, { heavy: true });
  expect(s.outbox.publishMany).not.toHaveBeenCalled();
  expect(s.bus.publishMany).not.toHaveBeenCalled();
  expect(s.transaction.run).toHaveBeenCalledWith(expect.any(Function), { heavy: true });
});
