import { DomainEvent, type IDomainEventProps } from "@app/core";

export class TodoCompletedEvent extends DomainEvent {
  static readonly type = "TodoCompletedEvent" as const;
  readonly completedAt: Date;

  constructor(props: IDomainEventProps<TodoCompletedEvent>) {
    super(props);
    this.completedAt = props.completedAt;
  }
}
