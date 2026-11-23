import { expect, test, vi } from "vitest";

import { container } from "../di";
import { z } from "../zod";
import { bindHandler, defineCommand, defineQuery, InvalidRequestError, Mediator } from "./mediator";

const SignUpCommand = defineCommand("test.sign-up", z.object({ email: z.string(), password: z.string(), clientKey: z.string() })).returns<{
  user: object;
  token: string;
  expiresAt: Date;
}>();
const ListTodosQuery = defineQuery("test.list", z.object({ limit: z.number().int().min(1).default(50) })).returns<unknown[]>();

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
