import { generateId } from "@app/core";
import { container, type DependencyContainer, inject, singleton } from "@app/di";
import { CommandHandlerNotFoundException, InvalidCommandHandlerException } from "@app/domain";
import { Subject } from "rxjs";
import type { Class } from "type-fest";

import { COMMAND_HANDLER_METADATA, COMMAND_METADATA } from "./decorators/constants";
import { DefaultCommandPubSub } from "./default-command-publisher";

export type CommandProps<T> = Omit<T, "correlationId" | "commandId"> & Partial<Command>;

export interface CommandMetadata {
  id: string;
}

export abstract class Command {
  public readonly commandId: string;
  public readonly correlationId: string;
  public readonly causationId?: string;

  constructor(props: CommandProps<unknown>) {
    this.correlationId = props.correlationId ?? generateId("corr");
    this.commandId = props.commandId ?? generateId("cmd");
  }
}

export interface ICommandPublisher<C extends Command = Command> {
  publish<T extends C = C>(command: T): any;
}
export interface ICommandBus<TCommand extends Command = Command> {
  execute<TResult>(command: TCommand): Promise<TResult>;
}
export interface ICommandHandler<TCommand extends Command, TResult> {
  execute(command: TCommand): Promise<TResult>;
}
export type CommandHandlerType = Class<ICommandHandler<Command, any>>;

export const injectCommandBus = () => inject(CommandBus);
export const InjectCommandBus = injectCommandBus;

@singleton()
export class CommandBus<C extends Command = Command> implements ICommandBus {
  private subject = new Subject<Command>();
  private readonly publisher: ICommandPublisher = new DefaultCommandPubSub(this.subject);

  #handlers = new Map<string, ICommandHandler<C, any>>();

  async execute<T extends C, R = any>(command: T): Promise<R> {
    const commandId = this.getCommandId(command);
    const handler = this.#handlers.get(commandId);
    if (!handler) {
      const commandName = this.getCommandName(command);
      throw new CommandHandlerNotFoundException(commandName);
    }
    this.publisher.publish(command);
    return handler.execute(command);
  }

  register(handlers: CommandHandlerType[] = [], c = container) {
    handlers.forEach((handler) => this.registerHandler(c, handler));
  }

  private bind<T extends C>(handler: ICommandHandler<T, any>, id: string) {
    this.#handlers.set(id, handler);
  }

  protected registerHandler(container: DependencyContainer, handler: CommandHandlerType) {
    const instance = container.resolve(handler);
    if (!instance) {
      return;
    }
    const target = this.reflectCommandId(handler);
    if (!target) {
      throw new InvalidCommandHandlerException();
    }
    this.bind(instance as ICommandHandler<C, any>, target);
  }

  private reflectCommandId(handler: CommandHandlerType): string | undefined {
    const command: Command = Reflect.getMetadata(COMMAND_HANDLER_METADATA, handler);
    const commandMetadata: CommandMetadata = Reflect.getMetadata(COMMAND_METADATA, command);
    return commandMetadata.id;
  }

  private getCommandId(command: C): string {
    const { constructor: commandType } = Object.getPrototypeOf(command);
    const commandMetadata: CommandMetadata = Reflect.getMetadata(COMMAND_METADATA, commandType);
    if (!commandMetadata) {
      throw new CommandHandlerNotFoundException(commandType.name);
    }

    return commandMetadata.id;
  }

  private getCommandName(command: C): string {
    const { constructor } = Object.getPrototypeOf(command);
    return constructor.name as string;
  }
}
