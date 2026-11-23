import { type DomainEventScope, injectDomainEventScope } from "@app/common/cqrs";
import { defineCommand, type IRequestHandler, type RequestPayload } from "@app/common/cqrs";
import { singleton } from "@app/common/di";
import { z } from "@app/common/zod";

import { type ITodoRepository, injectTodoRepo } from "../../adapters/todo.repository";
import { TodoIdSpecification } from "../../domain/todo/specs/todo-id.specification";
import { TodoId, todoIdSchema } from "../../domain/todo/todo-id.value-object";
import { TodoModifiedConcurrentlyError, TodoNotFoundError } from "../../domain/todo/todo.errors";
import type { ITodoDTO } from "../todo.dto";
import { toTodoDTO } from "../todo.mapper";

export const archiveTodoCommand = z.object({
  todoId: todoIdSchema,
});

export type IArchiveTodoCommand = z.infer<typeof archiveTodoCommand>;

export const ArchiveTodoCommand = defineCommand("todo.archive", archiveTodoCommand).returns<ITodoDTO>();
export type ArchiveTodoCommand = RequestPayload<typeof ArchiveTodoCommand>;

@singleton()
export class ArchiveTodoCommandHandler implements IRequestHandler<typeof ArchiveTodoCommand> {
  constructor(
    @injectTodoRepo() private readonly todoRepo: ITodoRepository,
    @injectDomainEventScope() private readonly events: DomainEventScope,
  ) {}

  async execute(command: ArchiveTodoCommand): Promise<ITodoDTO> {
    const id = TodoId.create(command.todoId); // already validated by the command schema
    const changed = await this.events.run(async (track) => {
      const todo = await this.todoRepo.findOne(new TodoIdSpecification(id));
      if (!todo) throw new TodoNotFoundError({ todoId: id.value });

      const expectedStatus = todo.status.value;
      todo.archive();

      // Two concurrent requests may both pass the guard; only one conditional UPDATE wins,
      // so the event reaches the outbox exactly once.
      if (!(await this.todoRepo.updateIfStatus(todo, expectedStatus))) {
        throw new TodoModifiedConcurrentlyError({ todoId: id.value, expectedStatus });
      }
      track(todo);
      return todo;
    });
    return toTodoDTO(changed);
  }
}
