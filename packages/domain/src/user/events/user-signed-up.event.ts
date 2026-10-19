import { DomainEvent, type IDomainEventProps } from "@app/core";

export class UserSignedUpEvent extends DomainEvent {
  static readonly type = "UserSignedUpEvent" as const;
  readonly email: string;

  constructor(props: IDomainEventProps<UserSignedUpEvent>) {
    super(props);
    this.email = props.email;
  }
}
