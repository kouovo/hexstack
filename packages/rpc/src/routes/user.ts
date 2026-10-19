import { AssignRoleCommand, assignRoleCommand, type IUserDTO, ListUsersQuery, listUsersQuery } from "@app/application";
import { CommandBus, QueryBus } from "@app/cqrs";
import { container } from "@app/di";

import { rpcMutation, rpcQuery } from "../procedure";

const commandBus = () => container.resolve(CommandBus);
const queryBus = () => container.resolve(QueryBus);

const list = rpcQuery
  .meta({ permissions: { user: ["list"] } })
  .input(listUsersQuery.partial().optional())
  .handler(({ input }) => queryBus().execute<IUserDTO[]>(new ListUsersQuery(input ?? {})));

const assignRole = rpcMutation
  .meta({ permissions: { user: ["assignRole"] } })
  .input(assignRoleCommand)
  .handler(({ input }) => commandBus().execute<AssignRoleCommand, IUserDTO>(new AssignRoleCommand(input)));

export const userRouter = { list, assignRole };
