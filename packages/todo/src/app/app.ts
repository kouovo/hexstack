import { handle } from "@app/common/cqrs";

import { ArchiveTodoCommand, ArchiveTodoCommandHandler } from "./command/archive-todo.command";
import { CompleteTodoCommand, CompleteTodoCommandHandler } from "./command/complete-todo.command";
import { CreateTodoCommand, CreateTodoCommandHandler } from "./command/create-todo.command";
import { ListTodosQuery, ListTodosQueryHandler } from "./query/list-todos.query";

/** Every use case of the todo context. Ports dispatch them through the mediator, never by calling handlers. */
export const TODO_HANDLERS = [
  handle(CreateTodoCommand, CreateTodoCommandHandler),
  handle(CompleteTodoCommand, CompleteTodoCommandHandler),
  handle(ArchiveTodoCommand, ArchiveTodoCommandHandler),
  handle(ListTodosQuery, ListTodosQueryHandler),
];
