import { DomainEvent, type IDomainEventProps } from "@app/core";

export class TodoArchivedEvent extends DomainEvent {
  static readonly type = "TodoArchivedEvent" as const;
  /** Status the todo was archived from ("open" or "completed"). */
  readonly previousStatus: string;
  readonly archivedAt: Date;

  constructor(props: IDomainEventProps<TodoArchivedEvent>) {
    super(props);
    this.previousStatus = props.previousStatus;
    this.archivedAt = props.archivedAt;
  }
}
