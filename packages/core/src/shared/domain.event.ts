import { generateId } from "./id";

type IDomainEventMetadata = {
  readonly timestamp: number;
  readonly correlationId?: string;
  readonly causationId?: string;
};

export type IDomainEventProps<T> = Omit<T, "id" | "metadata" | "eventType"> & {
  aggregateId: string;
  id?: string;
  eventType?: string;
  metadata?: IDomainEventMetadata;
};

export abstract class DomainEvent<T = unknown> {
  public readonly id: string;
  public readonly aggregateId: string;
  public readonly eventType: string;
  public readonly metadata: IDomainEventMetadata;

  constructor(props: IDomainEventProps<T>) {
    this.id = props.id ?? generateId("event");
    this.aggregateId = props.aggregateId;
    const ctor = this.constructor as { type?: string; name: string };
    this.eventType = props.eventType ?? ctor.type ?? ctor.name;
    this.metadata = {
      correlationId: props?.metadata?.correlationId,
      causationId: props?.metadata?.causationId,
      timestamp: props?.metadata?.timestamp || Date.now(),
    };
  }
}
