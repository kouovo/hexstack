import type { DomainEvent } from "./events";
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
  private readonly domainEvents: DomainEvent[] = [];

  protected addDomainEvent(domainEvent: DomainEvent): void {
    this.domainEvents.push(domainEvent);
  }

  clearDomainEvents(): DomainEvent[] {
    const events = [...this.domainEvents];
    this.domainEvents.length = 0;
    return events;
  }

  get events() {
    return this.domainEvents;
  }
}
