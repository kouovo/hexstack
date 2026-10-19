import type { DomainEvent } from "@app/core";
import { Command, commandHandler, type ICommandHandler, type IEventBus, injectEventBus } from "@app/cqrs";
import { singleton } from "@app/di";
import { type TodoEntity, TodoId, TodoIdSpecification, todoIdSchema, TodoModifiedConcurrentlyError, TodoNotFoundError } from "@app/domain";
import { z } from "@app/zod";

import { type IOutboxService, injectOutboxService } from "../../outbox";
import { runWithDomainEvents } from "../../shared/run-with-domain-events";
import { type ApplicationTransactionPort, injectApplicationTransaction } from "../../transaction";
import type { ITodoDTO } from "../todo.dto";
import { TodoMapper } from "../todo.mapper";
import { type ITodoRepository, injectTodoRepo } from "../todo.repository.port";

export const archiveTodoCommand = z.object({
  todoId: todoIdSchema,
});

export type IArchiveTodoCommand = z.infer<typeof archiveTodoCommand>;

export class ArchiveTodoCommand extends Command implements IArchiveTodoCommand {
  public readonly todoId: string;

  constructor(props: IArchiveTodoCommand) {
    super(props);
    this.todoId = props.todoId;
  }
}

/** open|completed -> archived. Thrown domain errors roll back the transaction. */
@commandHandler(ArchiveTodoCommand)
@singleton()
export class ArchiveTodoCommandHandler implements ICommandHandler<ArchiveTodoCommand, ITodoDTO> {
  constructor(
    @injectTodoRepo() private readonly todoRepo: ITodoRepository,
    @injectApplicationTransaction() private readonly transaction: ApplicationTransactionPort,
    @injectOutboxService() private readonly outboxService: IOutboxService,
    @injectEventBus() private readonly eventBus: IEventBus,
  ) {}

  async execute(command: ArchiveTodoCommand): Promise<ITodoDTO> {
    const id = TodoId.create(command.todoId); // already validated by the command schema
    const changed = await runWithDomainEvents(
      this.transaction,
      this.outboxService,
      this.eventBus,
      async (): Promise<{ result: TodoEntity; events: DomainEvent[] }> => {
        const todo = await this.todoRepo.findOne(new TodoIdSpecification(id));
        if (!todo) throw new TodoNotFoundError({ todoId: id.value });

        const expectedStatus = todo.status.value;
        todo.archive();

        // Two concurrent requests may both pass the guard; only one conditional UPDATE wins,
        // so the event reaches the outbox exactly once.
        if (!(await this.todoRepo.updateIfStatus(todo, expectedStatus))) {
          throw new TodoModifiedConcurrentlyError({ todoId: id.value, expectedStatus });
        }
        return { result: todo, events: todo.clearDomainEvents() };
      },
    );
    return TodoMapper.toResponse(changed);
  }
}
