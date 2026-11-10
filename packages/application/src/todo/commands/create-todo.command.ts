import { singleton } from "@app/di";
import { TodoEntity, TodoTitle, TodoTitleSpecification, todoTitleSchema } from "@app/domain";
import { z } from "@app/zod";

import { type DomainEventScope, injectDomainEventScope } from "../../shared/domain-event-scope";
import { defineCommand, type IRequestHandler, type RequestPayload } from "../../shared/mediator";
import type { ITodoDTO } from "../todo.dto";
import { TodoMapper } from "../todo.mapper";
import { type ITodoRepository, injectTodoRepo } from "../todo.repository.port";

export const createTodoCommand = z.object({
  title: todoTitleSchema,
});

export type ICreateTodoCommand = z.infer<typeof createTodoCommand>;

export const CreateTodoCommand = defineCommand("todo.create", createTodoCommand).returns<ITodoDTO>();
export type CreateTodoCommand = RequestPayload<typeof CreateTodoCommand>;

@singleton()
export class CreateTodoCommandHandler implements IRequestHandler<typeof CreateTodoCommand> {
  constructor(
    @injectTodoRepo() private readonly todoRepo: ITodoRepository,
    @injectDomainEventScope() private readonly events: DomainEventScope,
  ) {}

  async execute(command: CreateTodoCommand): Promise<ITodoDTO> {
    const todo = TodoEntity.create(new TodoTitleSpecification(TodoTitle.create(command.title)));

    await this.events.run(async (track) => {
      await this.todoRepo.insert(todo);
      track(todo);
    });

    return TodoMapper.toResponse(todo);
  }
}
