import { describe, expect, test } from "vitest";

import { roleHasPermissions, rolePermissions } from "./permissions";

describe(roleHasPermissions.name, () => {
  test.each([
    ["admin", { todo: ["archive"], user: ["assignRole"] }, true],
    ["member", { todo: ["create", "complete"] }, true],
    ["member", { todo: ["archive"] }, false],
    ["member", { user: ["list"] }, false],
    ["viewer", { todo: ["read"] }, true],
    ["viewer", { todo: ["create"] }, false],
    ["superuser", { todo: ["read"] }, false],
  ] as const)("%s %o -> %s", (role, required, expected) => {
    expect(roleHasPermissions(role, required)).toBe(expected);
  });

  test("an empty requirement is satisfied by any known role", () => {
    expect(roleHasPermissions("viewer", {})).toBe(true);
  });

  test("roles are ordered: viewer ⊂ member ⊂ admin", () => {
    expect(roleHasPermissions("member", rolePermissions.viewer)).toBe(true);
    expect(roleHasPermissions("admin", rolePermissions.member)).toBe(true);
    expect(roleHasPermissions("viewer", rolePermissions.member)).toBe(false);
  });
});
