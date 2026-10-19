import { Command, commandHandler, type ICommandHandler } from "@app/cqrs";
import { singleton } from "@app/di";
import { UserId } from "@app/domain";

import { type SessionService, injectSessionService } from "../session.service";

/** Sign out this device: the session row is deleted, not just the cookie. */
export class SignOutCommand extends Command {
  public readonly sessionId: string;

  constructor(props: { sessionId: string }) {
    super(props);
    this.sessionId = props.sessionId;
  }
}

@commandHandler(SignOutCommand)
@singleton()
export class SignOutCommandHandler implements ICommandHandler<SignOutCommand, void> {
  constructor(@injectSessionService() private readonly sessions: SessionService) {}

  async execute(command: SignOutCommand): Promise<void> {
    await this.sessions.revoke(command.sessionId);
  }
}

/** Sign out every device, e.g. after a lost laptop. */
export class SignOutAllCommand extends Command {
  public readonly userId: string;

  constructor(props: { userId: string }) {
    super(props);
    this.userId = props.userId;
  }
}

@commandHandler(SignOutAllCommand)
@singleton()
export class SignOutAllCommandHandler implements ICommandHandler<SignOutAllCommand, void> {
  constructor(@injectSessionService() private readonly sessions: SessionService) {}

  async execute(command: SignOutAllCommand): Promise<void> {
    await this.sessions.revokeAll(UserId.create(command.userId));
  }
}
