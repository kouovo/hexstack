import type { AnyEventDefinition, EventInput, EventItem } from "@millstream/cqrs";

import { generateId } from "./id";
import type { IdentifierValue } from "./identifiers";

export interface IEntityState<Id extends IdentifierValue = IdentifierValue> {
  id: Id;
}

export abstract class Entity<TEntityState extends IEntityState<TId>, TId extends IdentifierValue = TEntityState["id"]> {
  protected constructor(protected readonly state: TEntityState) {}

  get id(): TId {
    return this.state.id;
  }
}

export abstract class AggregateRoot<
  TEntityState extends IEntityState<TId>,
  TId extends IdentifierValue = TEntityState["id"],
> extends Entity<TEntityState, TId> {
  private readonly domainEvents: EventItem[] = [];

  /** The event id is fixed here, so every transport carries the same message uuid. */
  protected addDomainEvent<E extends AnyEventDefinition>(event: E, payload: EventInput<E>): void {
    this.domainEvents.push(event.of(payload, { uuid: generateId("event") }));
  }

  clearDomainEvents(): EventItem[] {
    const events = [...this.domainEvents];
    this.domainEvents.length = 0;
    return events;
  }
}
