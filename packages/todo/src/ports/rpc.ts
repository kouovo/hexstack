import { MEDIATOR, type Mediator } from "@app/common/cqrs";
import { container } from "@app/common/di";
import { rpcMutation, rpcQuery } from "@app/common/rpc";

import { ArchiveTodoCommand, archiveTodoCommand } from "../app/command/archive-todo.command";
import { CompleteTodoCommand, completeTodoCommand } from "../app/command/complete-todo.command";
import { CreateTodoCommand, createTodoCommand } from "../app/command/create-todo.command";
import { ListTodosQuery, listTodosQuery } from "../app/query/list-todos.query";

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
