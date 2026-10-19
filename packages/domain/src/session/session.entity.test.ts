import { describe, expect, test } from "vitest";

import { UserId } from "../user";
import { SESSION_REFRESH_INTERVAL_MS, SESSION_TTL_MS, SessionEntity } from "./session.entity";

const t0 = new Date("2024-01-01T00:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);
const start = () => SessionEntity.start({ id: "s1", userId: UserId.create("usr1"), secretHash: "ab", at: t0 });

describe(SessionEntity.name, () => {
  test("expires after the TTL", () => {
    const session = start();
    expect(session.isExpired(at(SESSION_TTL_MS - 1))).toBe(false);
    expect(session.isExpired(at(SESSION_TTL_MS))).toBe(true);
  });

  test("sliding refresh happens at most once per refresh interval", () => {
    const session = start();
    expect(session.refreshIfDue(at(SESSION_REFRESH_INTERVAL_MS - 1))).toBe(false);
    expect(session.refreshIfDue(at(SESSION_REFRESH_INTERVAL_MS))).toBe(true);
    expect(session.expiresAt).toEqual(at(SESSION_REFRESH_INTERVAL_MS + SESSION_TTL_MS));
    expect(session.refreshIfDue(at(SESSION_REFRESH_INTERVAL_MS + 1))).toBe(false);
  });
});
