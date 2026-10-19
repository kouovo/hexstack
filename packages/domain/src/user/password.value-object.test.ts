import { describe, expect, test } from "vitest";

import { PasswordPolicyViolationError, PasswordHashInvalidError } from "../errors/user.errors";
import { PasswordHash } from "./password-hash.value-object";
import { Password } from "./password.value-object";

describe(Password.name, () => {
  test.each(["correct horse", "12345678", "a".repeat(100), "P@ss w0rd!~"])("accepts %j", (raw) => {
    expect(Password.create(raw).reveal()).toBe(raw);
  });

  test.each([
    ["too short", "1234567", "at least 8"],
    ["too long", "a".repeat(101), "at most 100"],
    ["leading space", " password1", "start or end with a space"],
    ["trailing space", "password1 ", "start or end with a space"],
    ["non-ASCII", "pässwörd123", "printable ASCII"],
    ["control char", "pass\tword1", "printable ASCII"],
  ])("rejects %s with a specific reason", (_label, raw, reason) => {
    expect(() => Password.create(raw)).toThrow(PasswordPolicyViolationError);
    expect(() => Password.create(raw)).toThrow(reason);
  });

  test("never serialises the secret", () => {
    const password = Password.create("correct horse");
    expect(JSON.stringify({ password })).not.toContain("correct horse");
    expect(`${password}`).not.toContain("correct horse");
  });
});

describe(PasswordHash.name, () => {
  test("is opaque and redacted, but keeps its value for the repository", () => {
    const hash = PasswordHash.create("$argon2id$v=19$m=16384,t=3,p=1$salt$tag");
    expect(hash.value).toContain("$argon2id$");
    expect(JSON.stringify({ hash })).not.toContain("argon2id");
    expect(() => PasswordHash.create("plaintext")).toThrow(PasswordHashInvalidError);
  });
});
