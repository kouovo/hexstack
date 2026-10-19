import { container, type DependencyContainer, inject, singleton } from "@app/di";
import { InvalidQueryHandlerException, QueryHandlerNotFoundException } from "@app/domain";
import { Subject } from "rxjs";
import type { Class } from "type-fest";

import { QUERY_HANDLER_METADATA, QUERY_METADATA } from "./decorators/constants";
import { DefaultQueryPubSub } from "./default-query-publisher";

export abstract class Query {}

export interface QueryMetadata {
  id: string;
}

export interface IQueryHandler<TQuery extends Query, TResult> {
  execute(query: TQuery): Promise<TResult>;
}

export type QueryHandlerType = Class<IQueryHandler<Query, any>>;

export interface IQueryBus<TQuery extends Query = Query> {
  execute<TResult>(command: TQuery): Promise<TResult>;
}

export interface IQueryPublisher<C extends Query = Query> {
  publish<T extends C = C>(command: T): any;
}

export const injectQueryBus = () => inject(QueryBus);
export const InjectQueryBus = injectQueryBus;

@singleton()
export class QueryBus<Q extends Query = Query> implements IQueryBus {
  private subject = new Subject<Query>();
  private readonly publisher: IQueryPublisher = new DefaultQueryPubSub(this.subject);

  #handlers = new Map<string, IQueryHandler<Q, any>>();

  async execute<R = any>(query: Q): Promise<R> {
    const queryId = this.getQueryId(query);
    const handler = this.#handlers.get(queryId);
    if (!handler) {
      const queryName = this.getQueryName(query);
      throw new QueryHandlerNotFoundException(queryName);
    }
    this.publisher.publish(query);
    return handler.execute(query);
  }

  register(handlers: QueryHandlerType[] = [], c = container) {
    handlers.forEach((handler) => this.registerHandler(c, handler));
  }

  private bind<T extends Q>(handler: IQueryHandler<T, any>, id: string) {
    this.#handlers.set(id, handler);
  }

  protected registerHandler(container: DependencyContainer, handler: QueryHandlerType) {
    const instance = container.resolve(handler);
    if (!instance) {
      return;
    }
    const target = this.reflectQueryId(handler);
    if (!target) {
      throw new InvalidQueryHandlerException();
    }
    this.bind(instance as IQueryHandler<Q, any>, target);
  }

  private reflectQueryId(handler: QueryHandlerType): string | undefined {
    const query: Query = Reflect.getMetadata(QUERY_HANDLER_METADATA, handler);
    const queryMetadata: QueryMetadata = Reflect.getMetadata(QUERY_METADATA, query);
    return queryMetadata.id;
  }

  private getQueryId(query: Q): string {
    const { constructor: queryType } = Object.getPrototypeOf(query);
    const queryMetadata: QueryMetadata = Reflect.getMetadata(QUERY_METADATA, queryType);
    if (!queryMetadata) {
      throw new QueryHandlerNotFoundException(queryType.name);
    }

    return queryMetadata.id;
  }

  private getQueryName(query: Q): string {
    const { constructor } = Object.getPrototypeOf(query);
    return constructor.name as string;
  }
}
