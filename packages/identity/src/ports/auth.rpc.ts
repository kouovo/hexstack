import { currentPrincipal } from "@app/common/auth";
import { RequestContext } from "@app/common/context";
import { MEDIATOR, type Mediator } from "@app/common/cqrs";
import { container } from "@app/common/di";
import { rpcMutation, rpcQuery } from "@app/common/rpc";

import type { AuthResult, ICurrentUserDTO } from "../app/auth.dto";
import { SignInCommand, signInCommand } from "../app/command/sign-in.command";
import { SignOutAllCommand, SignOutCommand } from "../app/command/sign-out.command";
import { SignUpCommand, signUpCommand } from "../app/command/sign-up.command";
import { GetCurrentUserQuery } from "../app/query/get-current-user.query";
import { serializeClearedSessionCookie, serializeSessionCookie } from "./session-cookie";

const mediator = () => container.resolve<Mediator>(MEDIATOR);

/** The token only ever travels in the HttpOnly cookie, never in a response body. */
function issueSession(headers: Headers | undefined, { user, token, expiresAt }: AuthResult) {
  headers?.append("set-cookie", serializeSessionCookie(token, expiresAt));
  return { user };
}

const signUp = rpcMutation
  .meta({ public: true })
  .input(signUpCommand)
  .handler(async ({ input, context }) => {
    const clientKey = container.resolve(RequestContext).getClientAddress() ?? "unknown";
    const result = await mediator().execute(SignUpCommand, { ...input, clientKey });
    return issueSession(context.resHeaders, result);
  });

const signIn = rpcMutation
  .meta({ public: true })
  .input(signInCommand)
  .handler(async ({ input, context }) => {
    const result = await mediator().execute(SignInCommand, input);
    return issueSession(context.resHeaders, result);
  });

const signOut = rpcMutation.handler(async ({ context }) => {
  await mediator().execute(SignOutCommand, { sessionId: currentPrincipal().sessionId });
  context.resHeaders?.append("set-cookie", serializeClearedSessionCookie());
  return { ok: true as const };
});

const signOutAll = rpcMutation.handler(async ({ context }) => {
  await mediator().execute(SignOutAllCommand, { userId: currentPrincipal().userId });
  context.resHeaders?.append("set-cookie", serializeClearedSessionCookie());
  return { ok: true as const };
});

/** Public so clients can ask "am I signed in?" without a 401; null when anonymous. */
const me = rpcQuery.meta({ public: true }).handler(async (): Promise<ICurrentUserDTO | null> => {
  const principal = container.resolve(RequestContext).getPrincipal();
  if (!principal) return null;
  return mediator().query(GetCurrentUserQuery, { userId: principal.userId });
});

export const authRouter = { signUp, signIn, signOut, signOutAll, me };
