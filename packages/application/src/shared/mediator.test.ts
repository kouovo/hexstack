import { container } from "@app/di";
import { expect, test, vi } from "vitest";

import { SignUpCommand } from "../auth/commands/sign-up.command";
import { ListTodosQuery } from "../todo/queries/list-todos.query";
import { bindHandler, InvalidRequestError, Mediator } from "./mediator";

function setup() {
  const c = container.createChildContainer();
  const signUp = { execute: vi.fn(async () => ({ user: {}, token: "t", expiresAt: new Date() }) as never) };
  const list = { execute: vi.fn(async () => []) };
  c.registerInstance("signUp", signUp);
  c.registerInstance("list", list);
  const mediator = new Mediator();
  bindHandler(mediator, c, SignUpCommand, "signUp");
  bindHandler(mediator, c, ListTodosQuery, "list");
  return { mediator, signUp, list };
}

test("handlers receive the validated payload, with schema defaults and transport-only fields", async () => {
  const s = setup();
  await s.mediator.query(ListTodosQuery, {});
  expect(s.list.execute).toHaveBeenCalledWith({ limit: 50 });

  await s.mediator.execute(SignUpCommand, { email: "ada@example.com", password: "correct horse", clientKey: "1.2.3.4" });
  expect(s.signUp.execute).toHaveBeenCalledWith(expect.objectContaining({ clientKey: "1.2.3.4" }));
});

test("invalid input never reaches the handler", async () => {
  const s = setup();
  await expect(s.mediator.query(ListTodosQuery, { limit: 0 })).rejects.toBeInstanceOf(InvalidRequestError);
  expect(s.list.execute).not.toHaveBeenCalled();
});
