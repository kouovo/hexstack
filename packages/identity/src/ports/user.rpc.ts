import { MEDIATOR, type Mediator } from "@app/common/cqrs";
import { container } from "@app/common/di";
import { rpcMutation, rpcQuery } from "@app/common/rpc";

import { AssignRoleCommand, assignRoleCommand } from "../app/command/assign-role.command";
import { ListUsersQuery, listUsersQuery } from "../app/query/list-users.query";

const mediator = () => container.resolve<Mediator>(MEDIATOR);

const list = rpcQuery
  .meta({ permissions: { user: ["list"] } })
  .input(listUsersQuery.partial().optional())
  .handler(({ input }) => mediator().query(ListUsersQuery, input ?? {}));

const assignRole = rpcMutation
  .meta({ permissions: { user: ["assignRole"] } })
  .input(assignRoleCommand)
  .handler(({ input }) => mediator().execute(AssignRoleCommand, input));

export const userRouter = { list, assignRole };
