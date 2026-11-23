import { RequestContext, type RequestPrincipal } from "../context/request-context";
import { container } from "../di";
import { ForbiddenException, UnauthorizedException } from "../errors/common.errors";

/** Resource → actions, e.g. `{ todo: ["create"] }`. Each bounded context names its own resources. */
export type Permissions = { readonly [resource: string]: readonly string[] | undefined };

/** Decides whether a role grants a set of permissions. Implemented by the identity context. */
export interface AuthorizationPolicy {
  roleHasPermissions(role: string, required: Permissions): boolean;
}

export const AUTHORIZATION_POLICY = Symbol.for("AUTHORIZATION_POLICY");

/** The signed-in caller of the current request; throws when the request is anonymous. */
export function currentPrincipal(): RequestPrincipal {
  const principal = container.resolve(RequestContext).getPrincipal();
  if (!principal) throw new UnauthorizedException("Sign in required");
  return principal;
}

/** Requires a signed-in caller whose role grants every permission in `required`. */
export function authorize(required?: Permissions): RequestPrincipal {
  const principal = currentPrincipal();
  if (required && !container.resolve<AuthorizationPolicy>(AUTHORIZATION_POLICY).roleHasPermissions(principal.role, required)) {
    throw new ForbiddenException("You do not have permission to do this");
  }
  return principal;
}
