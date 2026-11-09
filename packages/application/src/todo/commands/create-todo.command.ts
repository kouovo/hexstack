import { Command, commandHandler, type ICommandHandler } from "@app/cqrs";
import { singleton } from "@app/di";
import { TodoEntity, TodoTitle, TodoTitleSpecification, todoTitleSchema } from "@app/domain";
import { z } from "@app/zod";

import { type DomainEventScope, injectDomainEventScope } from "../../shared/domain-event-scope";
import type { ITodoDTO } from "../todo.dto";
import { TodoMapper } from "../todo.mapper";
import { type ITodoRepository, injectTodoRepo } from "../todo.repository.port";

export const createTodoCommand = z.object({
  title: todoTitleSchema,
});

export type ICreateTodoCommand = z.infer<typeof createTodoCommand>;

export class CreateTodoCommand extends Command implements ICreateTodoCommand {
  public readonly title: string;

  constructor(props: ICreateTodoCommand) {
    super(props);
    this.title = props.title;
  }
}

@commandHandler(CreateTodoCommand)
@singleton()
export class CreateTodoCommandHandler implements ICommandHandler<CreateTodoCommand, ITodoDTO> {
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
