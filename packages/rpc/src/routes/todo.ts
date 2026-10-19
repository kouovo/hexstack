import {
  ArchiveTodoCommand,
  archiveTodoCommand,
  CompleteTodoCommand,
  completeTodoCommand,
  CreateTodoCommand,
  createTodoCommand,
  type ITodoDTO,
  ListTodosQuery,
  listTodosQuery,
} from "@app/application";
import { CommandBus, QueryBus } from "@app/cqrs";
import { container } from "@app/di";

import { rpcMutation, rpcQuery } from "../procedure";

const commandBus = () => container.resolve(CommandBus);
const queryBus = () => container.resolve(QueryBus);

const create = rpcMutation
  .meta({ permissions: { todo: ["create"] } })
  .input(createTodoCommand)
  .handler(({ input }) => commandBus().execute<CreateTodoCommand, ITodoDTO>(new CreateTodoCommand(input)));

const complete = rpcMutation
  .meta({ permissions: { todo: ["complete"] } })
  .input(completeTodoCommand)
  .handler(({ input }) => commandBus().execute<CompleteTodoCommand, ITodoDTO>(new CompleteTodoCommand(input)));

const archive = rpcMutation
  .meta({ permissions: { todo: ["archive"] } })
  .input(archiveTodoCommand)
  .handler(({ input }) => commandBus().execute<ArchiveTodoCommand, ITodoDTO>(new ArchiveTodoCommand(input)));

const list = rpcQuery
  .meta({ permissions: { todo: ["read"] } })
  .input(listTodosQuery.partial().optional())
  .handler(({ input }) => queryBus().execute<ITodoDTO[]>(new ListTodosQuery(input ?? {})));

export const todoRouter = { create, complete, archive, list };
