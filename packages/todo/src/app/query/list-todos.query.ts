import { type CachePort, injectCache, jitteredTtlSeconds } from "@app/common/cache";
import { defineQuery, type IRequestHandler, type RequestPayload } from "@app/common/cqrs";
import { specificationBuilder } from "@app/common/ddd";
import { singleton } from "@app/common/di";
import { z } from "@app/common/zod";

import { type ITodoRepository, injectTodoRepo } from "../../adapters/todo.repository";
import { TodoStatusSpecification } from "../../domain/todo/specs/todo-status.specification";
import { TodoStatus, todoStatusSchema } from "../../domain/todo/todo-status.value-object";
import type { ITodoState, TodoEntity } from "../../domain/todo/todo.entity";
import type { ITodoSpecVisitor } from "../../domain/todo/todo.type";
import { TODO_LIST_CACHE_NAMESPACE } from "../event/todo-list-cache-invalidation.handler";
import { todoListQueryKey } from "../todo-list-cache-key";
import type { ITodoDTO } from "../todo.dto";
import { toTodoDTO } from "../todo.mapper";

export const listTodosQuery = z.object({
  status: todoStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export type IListTodosQuery = z.input<typeof listTodosQuery>;

export const ListTodosQuery = defineQuery("todo.list", listTodosQuery).returns<ITodoDTO[]>();
export type ListTodosQuery = RequestPayload<typeof ListTodosQuery>;

@singleton()
export class ListTodosQueryHandler implements IRequestHandler<typeof ListTodosQuery> {
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
        const spec = specificationBuilder<TodoEntity, ITodoSpecVisitor, ITodoState>()
          .add(query.status, TodoStatus.create, TodoStatusSpecification)
          .build();
        const todos = await this.todoRepo.find(spec, { limit: query.limit });
        return todos.map(toTodoDTO);
      },
      jitteredTtlSeconds(ListTodosQueryHandler.TODO_LIST_TTL_SECONDS),
      // `lock` single-flights concurrent misses across replicas, so a version bump cannot stampede the database.
      { queryKey, lock: true, statsType: "todo-list" },
    );
  }
}
