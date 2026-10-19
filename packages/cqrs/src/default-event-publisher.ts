import type { DomainEvent } from "@app/core";
import type { Subject } from "rxjs";

export class DefaultEventPubSub<E extends DomainEvent> {
  constructor(public subject$: Subject<E>) {}

  async publish(event: E): Promise<void> {
    this.subject$.next(event);
  }

  async publishMany(events: E[]): Promise<void> {
    events.forEach((event) => this.subject$.next(event));
  }
}
