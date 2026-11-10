import {
  ArchiveTodoCommand,
  archiveTodoCommand,
  CompleteTodoCommand,
  completeTodoCommand,
  CreateTodoCommand,
  createTodoCommand,
  ListTodosQuery,
  listTodosQuery,
  MEDIATOR,
  type Mediator,
} from "@app/application";
import { container } from "@app/di";

import { rpcMutation, rpcQuery } from "../procedure";

const mediator = () => container.resolve<Mediator>(MEDIATOR);

const create = rpcMutation
  .meta({ permissions: { todo: ["create"] } })
  .input(createTodoCommand)
  .handler(({ input }) => mediator().execute(CreateTodoCommand, input));

const complete = rpcMutation
  .meta({ permissions: { todo: ["complete"] } })
  .input(completeTodoCommand)
  .handler(({ input }) => mediator().execute(CompleteTodoCommand, input));

const archive = rpcMutation
  .meta({ permissions: { todo: ["archive"] } })
  .input(archiveTodoCommand)
  .handler(({ input }) => mediator().execute(ArchiveTodoCommand, input));

const list = rpcQuery
  .meta({ permissions: { todo: ["read"] } })
  .input(listTodosQuery.partial().optional())
  .handler(({ input }) => mediator().query(ListTodosQuery, input ?? {}));

export const todoRouter = { create, complete, archive, list };
