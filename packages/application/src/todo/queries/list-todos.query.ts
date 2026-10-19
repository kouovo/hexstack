import { specificationBuilder } from "@app/core";
import { type IQueryHandler, Query, queryHandler } from "@app/cqrs";
import { singleton } from "@app/di";
import { type ITodoSpecVisitor, type TodoEntity, TodoStatus, TodoStatusSpecification, todoStatusSchema } from "@app/domain";
import { z } from "@app/zod";

import { type CachePort, injectCache } from "../../cache";
import { TODO_CACHE_NAMESPACE, TODO_LIST_CACHE_TTL_SECONDS } from "../todo-cache";
import type { ITodoDTO } from "../todo.dto";
import { TodoMapper } from "../todo.mapper";
import { type ITodoRepository, injectTodoRepo } from "../todo.repository.port";

export const listTodosQuery = z.object({
  status: todoStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export type IListTodosQuery = z.input<typeof listTodosQuery>;

export class ListTodosQuery extends Query {
  public readonly status?: string;
  public readonly limit: number;

  constructor(props: IListTodosQuery = {}) {
    super();
    const parsed = listTodosQuery.parse(props);
    this.status = parsed.status;
    this.limit = parsed.limit;
  }
}

@queryHandler(ListTodosQuery)
@singleton()
export class ListTodosQueryHandler implements IQueryHandler<ListTodosQuery, ITodoDTO[]> {
  constructor(
    @injectTodoRepo() private readonly todoRepo: ITodoRepository,
    @injectCache() private readonly cache: CachePort,
  ) {}

  async execute(query: ListTodosQuery): Promise<ITodoDTO[]> {
    const key = JSON.stringify({ status: query.status ?? null, limit: query.limit });
    return this.cache.getOrSetVersioned(
      TODO_CACHE_NAMESPACE,
      async () => {
        // Cache DTOs, never live entities; preserve the same spec-based read on a miss.
        const spec = specificationBuilder<TodoEntity, ITodoSpecVisitor>()
          .add(query.status, TodoStatus.create, TodoStatusSpecification)
          .build();
        const todos = await this.todoRepo.find(spec, { limit: query.limit });
        return todos.map((todo) => TodoMapper.toResponse(todo));
      },
      TODO_LIST_CACHE_TTL_SECONDS,
      { queryKey: key },
    );
  }
}
