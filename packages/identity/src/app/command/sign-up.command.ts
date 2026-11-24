import { type ApplicationTransactionPort, injectApplicationTransaction } from "@app/common/cqrs";
import { defineCommand, type IRequestHandler, type RequestPayload } from "@app/common/cqrs";
import { singleton } from "@app/common/di";
import { z } from "@app/common/zod";

import { type IUserRepository, injectUserRepo } from "../../adapters/user.repository";
import { RateLimitedError } from "../../domain/auth.errors";
import { Password, passwordSchema } from "../../domain/user/password.value-object";
import { UserEmailSpecification } from "../../domain/user/specs/user-email.specification";
import { UserPasswordHashSpecification } from "../../domain/user/specs/user-password-hash.specification";
import { UserEmail, userEmailSchema } from "../../domain/user/user-email.value-object";
import { UserEntity } from "../../domain/user/user.entity";
import { EmailAlreadyRegisteredError } from "../../domain/user/user.errors";
import type { AuthResult } from "../auth.dto";
import { type PasswordHasher, injectPasswordHasher } from "../password-hasher.port";
import { type RateLimiter, injectRateLimiter, retryAfterSeconds, SIGN_UP_RATE_LIMIT } from "../rate-limiter.port";
import { type SessionService, injectSessionService } from "../session.service";
import { toUserDTO } from "../user.mapper";

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
    @injectApplicationTransaction() private readonly transaction: ApplicationTransactionPort,
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
    const { session, token } = await this.transaction.run(async () => {
      await this.users.insert(user);
      return this.sessions.start(user.id);
    });
    return { user: toUserDTO(user), token, expiresAt: session.expiresAt };
  }
}
