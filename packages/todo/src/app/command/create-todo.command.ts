import { type ApplicationTransactionPort, injectApplicationTransaction } from "@app/common/cqrs";
import { defineCommand, type IRequestHandler, type RequestPayload } from "@app/common/cqrs";
import { singleton } from "@app/common/di";
import { z } from "@app/common/zod";

import { type ITodoRepository, injectTodoRepo } from "../../adapters/todo.repository";
import { TodoTitleSpecification } from "../../domain/todo/specs/todo-title.specification";
import { TodoTitle, todoTitleSchema } from "../../domain/todo/todo-title.value-object";
import { TodoEntity } from "../../domain/todo/todo.entity";
import type { ITodoDTO } from "../todo.dto";
import { toTodoDTO } from "../todo.mapper";

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
    @injectApplicationTransaction() private readonly transaction: ApplicationTransactionPort,
  ) {}

  async execute(command: CreateTodoCommand): Promise<ITodoDTO> {
    const todo = TodoEntity.create(new TodoTitleSpecification(TodoTitle.create(command.title)));

    await this.transaction.run(async () => {
      await this.todoRepo.insert(todo);
    });

    return toTodoDTO(todo);
  }
}
