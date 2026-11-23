import { handle } from "@app/common/cqrs";

import { AssignRoleCommand, AssignRoleCommandHandler } from "./command/assign-role.command";
import { SignInCommand, SignInCommandHandler } from "./command/sign-in.command";
import { SignOutAllCommand, SignOutAllCommandHandler, SignOutCommand, SignOutCommandHandler } from "./command/sign-out.command";
import { SignUpCommand, SignUpCommandHandler } from "./command/sign-up.command";
import { GetCurrentUserQuery, GetCurrentUserQueryHandler } from "./query/get-current-user.query";
import { ListUsersQuery, ListUsersQueryHandler } from "./query/list-users.query";

/** Every use case of the identity context. */
export const IDENTITY_HANDLERS = [
  handle(SignUpCommand, SignUpCommandHandler),
  handle(SignInCommand, SignInCommandHandler),
  handle(SignOutCommand, SignOutCommandHandler),
  handle(SignOutAllCommand, SignOutAllCommandHandler),
  handle(GetCurrentUserQuery, GetCurrentUserQueryHandler),
  handle(AssignRoleCommand, AssignRoleCommandHandler),
  handle(ListUsersQuery, ListUsersQueryHandler),
];
