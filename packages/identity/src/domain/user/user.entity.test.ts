import { describe, expect, test } from "vitest";

import { UserRoleChangedEvent } from "./events/user-role-changed.event";
import { UserSignedUpEvent } from "./events/user-signed-up.event";
import { PasswordHash } from "./password-hash.value-object";
import { UserEmailSpecification } from "./specs/user-email.specification";
import { UserPasswordHashSpecification } from "./specs/user-password-hash.specification";
import { UserEmail } from "./user-email.value-object";
import { UserRole } from "./user-role.value-object";
import { UserEntity } from "./user.entity";
import { UserEmailInvalidError, UserRoleInvalidError } from "./user.errors";

const newUser = () =>
  UserEntity.signUp(
    new UserEmailSpecification(UserEmail.create("  Ada@Example.COM ")).and(
      new UserPasswordHashSpecification(PasswordHash.rehydrate("$argon2id$stub")),
    ),
  );

describe(UserEntity.name, () => {
  test("sign-up normalises the email, defaults to member, records UserSignedUpEvent", () => {
    const user = newUser();
    expect(user.email.value).toBe("ada@example.com");
    expect(user.role.value).toBe("member");
    expect(user.clearDomainEvents()).toEqual([
      expect.objectContaining({ event: UserSignedUpEvent, payload: { userId: user.id.value, email: "ada@example.com" } }),
    ]);
  });

  test("changeRole records an event only when the role actually changes", () => {
    const user = newUser();
    user.clearDomainEvents();
    expect(user.changeRole(UserRole.create("member"))).toBe(false);
    expect(user.changeRole(UserRole.create("admin"))).toBe(true);
    const [event] = user.clearDomainEvents();
    expect(event).toMatchObject({ event: UserRoleChangedEvent, payload: { userId: user.id.value, previousRole: "member", role: "admin" } });
  });

  test("the entity never serialises its password hash", () => {
    expect(JSON.stringify(newUser())).not.toContain("argon2id");
  });

  test("role permissions come from the RBAC policy", () => {
    expect(UserRole.create("viewer").can({ todo: ["read"] })).toBe(true);
    expect(UserRole.create("viewer").can({ todo: ["create"] })).toBe(false);
  });

  test("invalid input is rejected", () => {
    expect(() => UserEmail.create("not-an-email")).toThrow(UserEmailInvalidError);
    expect(() => UserRole.create("root")).toThrow(UserRoleInvalidError);
  });

  test("email spec matches the normalised form", () => {
    expect(new UserEmailSpecification(UserEmail.create("ADA@example.com")).isSatisfiedBy(newUser())).toBe(true);
  });
});
