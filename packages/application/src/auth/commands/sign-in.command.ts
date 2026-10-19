import { Command, commandHandler, type ICommandHandler } from "@app/cqrs";
import { singleton } from "@app/di";
import {
  UserEmail,
  UserEmailSpecification,
  userEmailSchema,
  AccountNotFoundError,
  IncorrectPasswordError,
  RateLimitedError,
} from "@app/domain";
import { z } from "@app/zod";

import { UserMapper } from "../../user/user.mapper";
import { type IUserRepository, injectUserRepo } from "../../user/user.repository.port";
import type { AuthResult } from "../auth.dto";
import { type PasswordHasher, injectPasswordHasher } from "../password-hasher.port";
import { type RateLimiter, injectRateLimiter, retryAfterSeconds, SIGN_IN_RATE_LIMIT } from "../rate-limiter.port";
import { type SessionService, injectSessionService } from "../session.service";

export const signInCommand = z.object({
  email: userEmailSchema,
  // Not the new-password policy (that would lock out users if the policy tightens); only bounds what gets hashed.
  password: z.string().min(1, "Password is required").max(256),
});

export type ISignInCommand = z.infer<typeof signInCommand>;

export class SignInCommand extends Command implements ISignInCommand {
  public readonly email: string;
  public readonly password: string;

  constructor(props: ISignInCommand) {
    super(props);
    this.email = props.email;
    this.password = props.password;
  }
}

@commandHandler(SignInCommand)
@singleton()
export class SignInCommandHandler implements ICommandHandler<SignInCommand, AuthResult> {
  constructor(
    @injectUserRepo() private readonly users: IUserRepository,
    @injectPasswordHasher() private readonly hasher: PasswordHasher,
    @injectRateLimiter() private readonly rateLimiter: RateLimiter,
    @injectSessionService() private readonly sessions: SessionService,
  ) {}

  async execute(command: SignInCommand): Promise<AuthResult> {
    const email = UserEmail.create(command.email); // already validated by the command schema
    // Per-account bucket (keyed by email, whether or not it exists). No lockout, no IP blocking.
    const allowed = await this.rateLimiter.consume(SIGN_IN_RATE_LIMIT, email.value);
    if (!allowed) throw new RateLimitedError({ policy: "sign-in", retryAfterSeconds: retryAfterSeconds(SIGN_IN_RATE_LIMIT) });

    const user = await this.users.findOne(new UserEmailSpecification(email));
    // Explicit errors on purpose: clearer for users, and hiding existence is unreliable anyway (hash timing).
    if (!user) throw new AccountNotFoundError();
    if (!(await this.hasher.verify(user.passwordHash, command.password))) {
      throw new IncorrectPasswordError({ userId: user.id.value });
    }

    const { session, token } = await this.sessions.start(user.id);
    return { user: UserMapper.toResponse(user), token, expiresAt: session.expiresAt };
  }
}
