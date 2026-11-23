import { defineCommand, type IRequestHandler, type RequestPayload } from "@app/common/cqrs";
import { singleton } from "@app/common/di";
import { z } from "@app/common/zod";

import { UserId, userIdSchema } from "../../domain/user/user-id.value-object";
import { type SessionService, injectSessionService } from "../session.service";

/** Sign out this device: the session row is deleted, not just the cookie. */
export const SignOutCommand = defineCommand("auth.sign-out", z.object({ sessionId: z.string().min(1) }));
export type SignOutCommand = RequestPayload<typeof SignOutCommand>;

@singleton()
export class SignOutCommandHandler implements IRequestHandler<typeof SignOutCommand> {
  constructor(@injectSessionService() private readonly sessions: SessionService) {}

  async execute(command: SignOutCommand): Promise<void> {
    await this.sessions.revoke(command.sessionId);
  }
}

/** Sign out every device, e.g. after a lost laptop. */
export const SignOutAllCommand = defineCommand("auth.sign-out-all", z.object({ userId: userIdSchema }));
export type SignOutAllCommand = RequestPayload<typeof SignOutAllCommand>;

@singleton()
export class SignOutAllCommandHandler implements IRequestHandler<typeof SignOutAllCommand> {
  constructor(@injectSessionService() private readonly sessions: SessionService) {}

  async execute(command: SignOutAllCommand): Promise<void> {
    await this.sessions.revokeAll(UserId.create(command.userId));
  }
}
