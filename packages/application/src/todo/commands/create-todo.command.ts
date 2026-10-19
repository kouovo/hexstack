import { Command, commandHandler, type ICommandHandler, type IEventBus, injectEventBus } from "@app/cqrs";
import { singleton } from "@app/di";
import { TodoEntity, TodoTitle, todoTitleSchema } from "@app/domain";
import { z } from "@app/zod";

import { type IOutboxService, injectOutboxService } from "../../outbox";
import { runWithDomainEvents } from "../../shared/run-with-domain-events";
import { type ApplicationTransactionPort, injectApplicationTransaction } from "../../transaction";
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
    @injectApplicationTransaction() private readonly transaction: ApplicationTransactionPort,
    @injectOutboxService() private readonly outboxService: IOutboxService,
    @injectEventBus() private readonly eventBus: IEventBus,
  ) {}

  async execute(command: CreateTodoCommand): Promise<ITodoDTO> {
    const todo = TodoEntity.create({ title: TodoTitle.create(command.title) });

    await runWithDomainEvents(this.transaction, this.outboxService, this.eventBus, async () => {
      await this.todoRepo.insert(todo);
      return todo.clearDomainEvents();
    });

    return TodoMapper.toResponse(todo);
  }
}
