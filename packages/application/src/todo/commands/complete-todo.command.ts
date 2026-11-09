import { Command, commandHandler, type ICommandHandler } from "@app/cqrs";
import { singleton } from "@app/di";
import { TodoId, TodoIdSpecification, todoIdSchema, TodoModifiedConcurrentlyError, TodoNotFoundError } from "@app/domain";
import { z } from "@app/zod";

import { type DomainEventScope, injectDomainEventScope } from "../../shared/domain-event-scope";
import type { ITodoDTO } from "../todo.dto";
import { TodoMapper } from "../todo.mapper";
import { type ITodoRepository, injectTodoRepo } from "../todo.repository.port";

export const completeTodoCommand = z.object({
  todoId: todoIdSchema,
});

export type ICompleteTodoCommand = z.infer<typeof completeTodoCommand>;

export class CompleteTodoCommand extends Command implements ICompleteTodoCommand {
  public readonly todoId: string;

  constructor(props: ICompleteTodoCommand) {
    super(props);
    this.todoId = props.todoId;
  }
}

/** open -> completed. Thrown domain errors roll back the transaction. */
@commandHandler(CompleteTodoCommand)
@singleton()
export class CompleteTodoCommandHandler implements ICommandHandler<CompleteTodoCommand, ITodoDTO> {
  constructor(
    @injectTodoRepo() private readonly todoRepo: ITodoRepository,
    @injectDomainEventScope() private readonly events: DomainEventScope,
  ) {}

  async execute(command: CompleteTodoCommand): Promise<ITodoDTO> {
    const id = TodoId.create(command.todoId); // already validated by the command schema
    const changed = await this.events.run(async (track) => {
      const todo = await this.todoRepo.findOne(new TodoIdSpecification(id));
      if (!todo) throw new TodoNotFoundError({ todoId: id.value });

      const expectedStatus = todo.status.value;
      todo.complete();

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
