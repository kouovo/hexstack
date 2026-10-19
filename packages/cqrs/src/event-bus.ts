import type { DomainEvent } from "@app/core";
import { container, type DependencyContainer, inject, singleton } from "@app/di";
import { InvalidEventHandlerException } from "@app/domain";
import { createLogger } from "@app/logger";
import { Subject } from "rxjs";
import type { Class } from "type-fest";

import { EVENT_HANDLER_METADATA, EVENT_METADATA } from "./decorators/constants";
import { DefaultEventPubSub } from "./default-event-publisher";

export interface EventMetadata {
  id: string;
}
export interface IEventBus<TEvent extends DomainEvent = DomainEvent> {
  publish(event: TEvent): Promise<void>;
  publishMany(events: TEvent[]): Promise<void>;
}

export interface IEventPublisher<TEvent extends DomainEvent = DomainEvent> {
  publish(event: TEvent): Promise<void>;
  publishMany(events: TEvent[]): Promise<void>;
}

export interface IEventHandler<TEvent extends DomainEvent, TResult = void> {
  handle(event: TEvent): Promise<TResult> | TResult;
}
export type EventHandlerType = Class<IEventHandler<DomainEvent, any>>;

export const injectEventBus = () => inject(EventBus);

@singleton()
export class EventBus<TEvent extends DomainEvent = DomainEvent> implements IEventBus<TEvent> {
  private subject = new Subject<TEvent>();
  private readonly publisher: IEventPublisher = new DefaultEventPubSub(this.subject);
  logger = createLogger(EventBus.name);

  #handlers = new Map<string, IEventHandler<TEvent, any>[]>();
  #globalHandlers: IEventHandler<TEvent, any>[] = [];

  registerGlobal(handler: IEventHandler<TEvent, any>): void {
    this.#globalHandlers.push(handler);
  }

  async publish(event: TEvent): Promise<void> {
    const eventName = this.getEventName(event);

    for (const globalHandler of this.#globalHandlers) {
      try {
        await globalHandler.handle(event);
      } catch (error) {
        this.logger.error({ err: error, eventName }, "global handler failed");
      }
    }

    const eventId = this.getEventId(event);
    if (!eventId) {
      this.logger.warn(`skip event without metadata: ${eventName}`);
      return;
    }

    const handlers = this.#handlers.get(eventId);
    if (!handlers?.length) {
      this.logger.warn(`skip event without handler: ${eventName} (${eventId})`);
      return;
    }

    this.logger.info(`publish event: ${eventName} (${eventId})`);
    await this.publisher.publish(event);

    for (const handler of handlers) {
      try {
        await handler.handle(event);
        this.logger.debug(`event handler completed: ${eventName}`);
      } catch (error) {
        this.logger.error({ err: error, eventName, eventId }, "event handler failed");
      }
    }
  }

  async publishMany(events: TEvent[]): Promise<void> {
    this.logger.info(`publishMany: ${events.length} event(s)`);
    for (const event of events) {
      await this.publish(event);
    }
  }

  register(handlers: EventHandlerType[] = [], c = container) {
    handlers.forEach((handler) => this.registerHandler(c, handler));
  }

  private bind<T extends TEvent>(handler: IEventHandler<T, any>, id: string) {
    const handlers = this.#handlers.get(id);
    if (handlers) {
      if (!handlers.includes(handler)) handlers.push(handler);
      return;
    }
    this.#handlers.set(id, [handler]);
  }

  protected registerHandler(container: DependencyContainer, handler: EventHandlerType) {
    const instance = container.resolve(handler);
    if (!instance) {
      return;
    }
    const target = this.reflectEventId(handler);
    if (!target) {
      throw new InvalidEventHandlerException();
    }
    this.bind(instance as IEventHandler<TEvent, any>, target);
  }

  private reflectEventId(handler: EventHandlerType): string | undefined {
    const event: DomainEvent = Reflect.getMetadata(EVENT_HANDLER_METADATA, handler);
    const eventMetadata: EventMetadata = Reflect.getMetadata(EVENT_METADATA, event);
    return eventMetadata.id;
  }

  private getEventId(event: TEvent): string | undefined {
    const { constructor: eventType } = Object.getPrototypeOf(event);
    const eventMetadata: EventMetadata = Reflect.getMetadata(EVENT_METADATA, eventType);
    if (!eventMetadata) {
      return;
    }
    return eventMetadata.id;
  }

  private getEventName(event: TEvent): string {
    const { constructor } = Object.getPrototypeOf(event);
    return constructor.name as string;
  }
}
