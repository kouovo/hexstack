import { DomainError } from "@app/core";

/** Registration/programming faults, not public failures. */
export class CommandHandlerNotFoundException extends DomainError<"CommandHandlerNotFoundException"> {
  readonly _tag = "CommandHandlerNotFoundException";
  readonly kind = "internal";
  constructor(readonly commandName: string) {
    super(`The command handler for the "${commandName}" command was not found!`);
  }
}

export class QueryHandlerNotFoundException extends DomainError<"QueryHandlerNotFoundException"> {
  readonly _tag = "QueryHandlerNotFoundException";
  readonly kind = "internal";
  constructor(readonly queryName: string) {
    super(`The query handler for the "${queryName}" query was not found!`);
  }
}

export class EventHandlerNotFoundException extends DomainError<"EventHandlerNotFoundException"> {
  readonly _tag = "EventHandlerNotFoundException";
  readonly kind = "internal";
  constructor(readonly eventId: string) {
    super(`The event handler for the "${eventId}" event was not found!`);
  }
}

export class InvalidCommandHandlerException extends DomainError<"InvalidCommandHandlerException"> {
  readonly _tag = "InvalidCommandHandlerException";
  readonly kind = "internal";
  readonly decorator = "commandHandler";
  constructor() {
    super("Invalid command handler (missing @commandHandler() decorator?)");
  }
}

export class InvalidQueryHandlerException extends DomainError<"InvalidQueryHandlerException"> {
  readonly _tag = "InvalidQueryHandlerException";
  readonly kind = "internal";
  readonly decorator = "queryHandler";
  constructor() {
    super("Invalid query handler (missing @queryHandler() decorator?)");
  }
}

export class InvalidEventHandlerException extends DomainError<"InvalidEventHandlerException"> {
  readonly _tag = "InvalidEventHandlerException";
  readonly kind = "internal";
  readonly decorator = "eventHandler";
  constructor() {
    super("Invalid event handler (missing @eventHandler() decorator?)");
  }
}
