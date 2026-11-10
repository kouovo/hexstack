import { singleton } from "@app/di";
import {
  Password,
  passwordSchema,
  UserEmail,
  UserEmailSpecification,
  userEmailSchema,
  UserEntity,
  UserPasswordHashSpecification,
  EmailAlreadyRegisteredError,
  RateLimitedError,
} from "@app/domain";
import { z } from "@app/zod";

import { type DomainEventScope, injectDomainEventScope } from "../../shared/domain-event-scope";
import { defineCommand, type IRequestHandler, type RequestPayload } from "../../shared/mediator";
import { toUserDTO } from "../../user/user.mapper";
import { type IUserRepository, injectUserRepo } from "../../user/user.repository.port";
import type { AuthResult } from "../auth.dto";
import { type PasswordHasher, injectPasswordHasher } from "../password-hasher.port";
import { type RateLimiter, injectRateLimiter, retryAfterSeconds, SIGN_UP_RATE_LIMIT } from "../rate-limiter.port";
import { type SessionService, injectSessionService } from "../session.service";

export const signUpCommand = z.object({
  email: userEmailSchema,
  password: passwordSchema,
});

export type ISignUpCommand = z.infer<typeof signUpCommand>;

export const SignUpCommand = defineCommand(
  "auth.sign-up",
  signUpCommand.extend({
    /** Rate-limit key for an anonymous caller (client address). Filled in by the transport, never by the client. */
    clientKey: z.string().min(1),
  }),
).returns<AuthResult>();
export type SignUpCommand = RequestPayload<typeof SignUpCommand>;

@singleton()
export class SignUpCommandHandler implements IRequestHandler<typeof SignUpCommand> {
  constructor(
    @injectUserRepo() private readonly users: IUserRepository,
    @injectPasswordHasher() private readonly hasher: PasswordHasher,
    @injectRateLimiter() private readonly rateLimiter: RateLimiter,
    @injectSessionService() private readonly sessions: SessionService,
    @injectDomainEventScope() private readonly events: DomainEventScope,
  ) {}

  async execute(command: SignUpCommand): Promise<AuthResult> {
    // Rate limit before any hashing: hashing is the expensive, abusable part.
    const allowed = await this.rateLimiter.consume(SIGN_UP_RATE_LIMIT, command.clientKey);
    if (!allowed) throw new RateLimitedError({ policy: "sign-up", retryAfterSeconds: retryAfterSeconds(SIGN_UP_RATE_LIMIT) });

    const email = UserEmail.create(command.email); // already validated by the command schema
    const password = Password.parse(command.password); // the domain enforces the password policy
    // Explicit message (no enumeration hiding): the unique index still guards the race below.
    const emailSpec = new UserEmailSpecification(email);
    if (await this.users.findOne(emailSpec)) {
      throw new EmailAlreadyRegisteredError({ detectedBy: "lookup" });
    }

    const passwordHash = await this.hasher.hash(password); // outside the transaction: slow
    const user = UserEntity.signUp(emailSpec.and(new UserPasswordHashSpecification(passwordHash)));

    // Account + first session commit together; a thrown duplicate rolls both back.
    const { session, token } = await this.events.run(async (track) => {
      await this.users.insert(user);
      track(user);
      return this.sessions.start(user.id);
    });
    return { user: toUserDTO(user), token, expiresAt: session.expiresAt };
  }
}
