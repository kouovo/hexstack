import { type ApplicationTransactionPort, injectApplicationTransaction } from "@app/common/cqrs";
import { defineCommand, type IRequestHandler, type RequestPayload } from "@app/common/cqrs";
import { singleton } from "@app/common/di";
import { z } from "@app/common/zod";

import { type ITodoRepository, injectTodoRepo } from "../../adapters/todo.repository";
import { TodoIdSpecification } from "../../domain/todo/specs/todo-id.specification";
import { TodoId, todoIdSchema } from "../../domain/todo/todo-id.value-object";
import { TodoModifiedConcurrentlyError, TodoNotFoundError } from "../../domain/todo/todo.errors";
import type { ITodoDTO } from "../todo.dto";
import { toTodoDTO } from "../todo.mapper";

export const completeTodoCommand = z.object({
  todoId: todoIdSchema,
});

export type ICompleteTodoCommand = z.infer<typeof completeTodoCommand>;

export const CompleteTodoCommand = defineCommand("todo.complete", completeTodoCommand).returns<ITodoDTO>();
export type CompleteTodoCommand = RequestPayload<typeof CompleteTodoCommand>;

@singleton()
export class CompleteTodoCommandHandler implements IRequestHandler<typeof CompleteTodoCommand> {
  constructor(
    @injectTodoRepo() private readonly todoRepo: ITodoRepository,
    @injectApplicationTransaction() private readonly transaction: ApplicationTransactionPort,
  ) {}

  async execute(command: CompleteTodoCommand): Promise<ITodoDTO> {
    const id = TodoId.create(command.todoId); // already validated by the command schema
    const changed = await this.transaction.run(async () => {
      const todo = await this.todoRepo.findOne(new TodoIdSpecification(id));
      if (!todo) throw new TodoNotFoundError({ todoId: id.value });

      const expectedStatus = todo.status.value;
      todo.complete();

      // Two concurrent requests may both pass the guard; only one conditional UPDATE wins,
      // so the event reaches the outbox exactly once.
      if (!(await this.todoRepo.updateIfStatus(todo, expectedStatus))) {
        throw new TodoModifiedConcurrentlyError({ todoId: id.value, expectedStatus });
      }
      return todo;
    });
    return toTodoDTO(changed);
  }
}
