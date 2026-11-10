import { singleton } from "@app/di";
import { TodoId, TodoIdSpecification, todoIdSchema, TodoModifiedConcurrentlyError, TodoNotFoundError } from "@app/domain";
import { z } from "@app/zod";

import { type DomainEventScope, injectDomainEventScope } from "../../shared/domain-event-scope";
import { defineCommand, type IRequestHandler, type RequestPayload } from "../../shared/mediator";
import type { ITodoDTO } from "../todo.dto";
import { TodoMapper } from "../todo.mapper";
import { type ITodoRepository, injectTodoRepo } from "../todo.repository.port";

export const archiveTodoCommand = z.object({
  todoId: todoIdSchema,
});

export type IArchiveTodoCommand = z.infer<typeof archiveTodoCommand>;

export const ArchiveTodoCommand = defineCommand("todo.archive", archiveTodoCommand).returns<ITodoDTO>();
export type ArchiveTodoCommand = RequestPayload<typeof ArchiveTodoCommand>;

/** open|completed -> archived. Thrown domain errors roll back the transaction. */
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
    return TodoMapper.toResponse(changed);
  }
}
