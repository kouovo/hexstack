import { AssignRoleCommand, assignRoleCommand, ListUsersQuery, listUsersQuery, MEDIATOR, type Mediator } from "@app/application";
import { container } from "@app/di";

import { rpcMutation, rpcQuery } from "../procedure";

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
