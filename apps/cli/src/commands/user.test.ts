import { PassThrough } from "node:stream";

import { USER_REPO } from "@app/application";
import { CommandBus } from "@app/cqrs";
import { type InjectionToken } from "@app/di";
import { PasswordHash, UserEmail, UserEntity } from "@app/domain";
import { expect, test, vi } from "vitest";

import type { CliServices } from "../context";
import { createCli } from "../create-cli";

function setup(found = true) {
  const user = UserEntity.signUp({ email: UserEmail.create("ada@example.com"), passwordHash: PasswordHash.rehydrate("$stub") });
  const execute = vi.fn(async () => ({ id: user.id.value, email: user.email.value, role: "admin" }));
  const findOne = vi.fn(async () => (found ? user : undefined));
  const resolve = vi.fn(async (token: InjectionToken<unknown>): Promise<unknown> => {
    if (token === USER_REPO) return { findOne };
    if (token === CommandBus) return { execute };
    throw new Error("Unexpected service");
  });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let output = "";
  stdout.on("data", (chunk) => {
    output += chunk;
  });
  stderr.on("data", (chunk) => {
    output += chunk;
  });
  const run = (...args: string[]) =>
    createCli().run(["user", "role", ...args], {
      services: { resolve: <T>(token: InjectionToken<T>) => resolve(token) as Promise<T> } satisfies CliServices,
      stdout,
      stderr,
    });
  return { user, run, execute, findOne, resolve, output: () => output };
}

test("an operator can promote an existing account, without outputting secrets", async () => {
  const s = setup();
  expect(await s.run("ADA@example.com", "admin", "--json")).toBe(0);
  expect(s.findOne).toHaveBeenCalled();
  expect(s.execute).toHaveBeenCalledWith(expect.objectContaining({ userId: s.user.id.value, role: "admin" }));
  expect(s.output()).toContain('"role":"admin"');
  expect(s.output()).not.toContain("password");
});

test("bad roles are rejected before any services are resolved", async () => {
  const s = setup();
  expect(await s.run("ada@example.com", "root")).not.toBe(0);
  expect(s.resolve).not.toHaveBeenCalled();
});

test("the command never silently creates an account", async () => {
  const s = setup(false);
  expect(await s.run("ada@example.com", "admin")).not.toBe(0);
  expect(s.execute).not.toHaveBeenCalled();
  expect(s.output()).toContain("sign up first");
});
