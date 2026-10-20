import { specificationBuilder } from "@app/core";
import { type IQueryHandler, Query, queryHandler } from "@app/cqrs";
import { singleton } from "@app/di";
import { type ITodoSpecVisitor, type TodoEntity, TodoStatus, TodoStatusSpecification, todoStatusSchema } from "@app/domain";
import { z } from "@app/zod";

import { type CachePort, injectCache, jitteredTtlSeconds } from "../../cache";
import { TODO_LIST_CACHE_NAMESPACE } from "../todo-cache-invalidation";
import { todoListQueryKey } from "../todo-list-cache-key";
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
  static readonly TODO_LIST_TTL_SECONDS = 30;

  constructor(
    @injectTodoRepo() private readonly todoRepo: ITodoRepository,
    @injectCache() private readonly cache: CachePort,
  ) {}

  async execute(query: ListTodosQuery): Promise<ITodoDTO[]> {
    const queryKey = todoListQueryKey({ status: query.status, limit: query.limit });
    return this.cache.getOrSetVersioned(
      TODO_LIST_CACHE_NAMESPACE,
      async () => {
        // Cache DTOs, never live entities; preserve the same spec-based read on a miss.
        const spec = specificationBuilder<TodoEntity, ITodoSpecVisitor>()
          .add(query.status, TodoStatus.create, TodoStatusSpecification)
          .build();
        const todos = await this.todoRepo.find(spec, { limit: query.limit });
        return todos.map((todo) => TodoMapper.toResponse(todo));
      },
      jitteredTtlSeconds(ListTodosQueryHandler.TODO_LIST_TTL_SECONDS),
      // `lock` single-flights concurrent misses across replicas, so a version bump cannot stampede the database.
      { queryKey, lock: true, statsType: "todo-list" },
    );
  }
}
