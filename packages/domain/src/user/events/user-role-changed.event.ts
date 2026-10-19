import { DomainEvent, type IDomainEventProps } from "@app/core";

export class UserRoleChangedEvent extends DomainEvent {
  static readonly type = "UserRoleChangedEvent" as const;
  readonly previousRole: string;
  readonly role: string;

  constructor(props: IDomainEventProps<UserRoleChangedEvent>) {
    super(props);
    this.previousRole = props.previousRole;
    this.role = props.role;
  }
}
