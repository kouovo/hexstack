import { DomainEvent } from "./domain.event";

export interface IRehydratedEventState {
  id: string;
  aggregateId: string;
  eventType: string;
  metadata: DomainEvent["metadata"];
  payload: Record<string, unknown>;
}

export class RehydratedDomainEvent extends DomainEvent {
  constructor(state: IRehydratedEventState) {
    super({
      id: state.id,
      aggregateId: state.aggregateId,
      eventType: state.eventType,
      metadata: state.metadata,
    });
    const payload = { ...state.payload };
    delete payload.id;
    delete payload.aggregateId;
    delete payload.metadata;
    delete payload.eventType;
    Object.assign(this, payload);
  }
}
