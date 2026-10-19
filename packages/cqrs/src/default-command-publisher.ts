import type { Subject } from "rxjs";

import type { Command, ICommandPublisher } from ".";

export class DefaultCommandPubSub<C extends Command> implements ICommandPublisher<C> {
  constructor(public subject$: Subject<C>) {}

  publish<T extends C>(command: T) {
    this.subject$.next(command);
  }
}
