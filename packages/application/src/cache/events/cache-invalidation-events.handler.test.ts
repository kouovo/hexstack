import { DomainEvent } from "@app/core";
import { expect, test, vi } from "vitest";

import { uncached } from "../cache.test-helper";
import { CacheInvalidationEventsHandler } from "./cache-invalidation-events.handler";

class ThingRenamedEvent extends DomainEvent {
  static readonly type = "ThingRenamedEvent" as const;
}

const renamed = () => new ThingRenamedEvent({ aggregateId: "thing_1" });

function setup() {
  const cache = uncached();
  const bump = vi.spyOn(cache, "bumpVersion");
  const del = vi.spyOn(cache, "delete");
  return { cache, bump, del, handler: new CacheInvalidationEventsHandler(cache) };
}

test("applies every deriver's deletes and bumps for the event type, once each", async () => {
  const s = setup();
  s.handler.register(ThingRenamedEvent.type, (event) => [
    { kind: "delete", key: `things:${event.aggregateId}` },
    { kind: "bump", namespace: "things:list" },
  ]);
  s.handler.register(ThingRenamedEvent.type, () => [{ kind: "bump", namespace: "things:list" }]);

  await s.handler.handle(renamed());

  expect(s.del).toHaveBeenCalledExactlyOnceWith("things:thing_1");
  expect(s.bump).toHaveBeenCalledExactlyOnceWith("things:list");
});

test("ignores events without rules", async () => {
  const s = setup();
  await s.handler.handle(renamed());
  expect(s.del).not.toHaveBeenCalled();
  expect(s.bump).not.toHaveBeenCalled();
});

test("a throwing deriver or failing step does not block the others or reject", async () => {
  const s = setup();
  s.handler.register(ThingRenamedEvent.type, () => {
    throw new Error("bad rule");
  });
  s.handler.register(ThingRenamedEvent.type, () => [
    { kind: "bump", namespace: "a" },
    { kind: "bump", namespace: "b" },
  ]);
  s.bump.mockRejectedValueOnce(new Error("redis down"));

  await expect(s.handler.handle(renamed())).resolves.toBeUndefined();
  expect(s.bump.mock.calls).toEqual([["a"], ["b"]]);
});
