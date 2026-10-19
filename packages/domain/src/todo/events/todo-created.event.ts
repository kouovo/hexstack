import { DomainEvent, type IDomainEventProps } from "@app/core";

export class TodoCreatedEvent extends DomainEvent {
  static readonly type = "TodoCreatedEvent" as const;
  readonly title: string;

  constructor(props: IDomainEventProps<TodoCreatedEvent>) {
    super(props);
    this.title = props.title;
  }
}
