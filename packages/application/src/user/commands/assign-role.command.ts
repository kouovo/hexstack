import { Command, commandHandler, type ICommandHandler, type IEventBus, injectEventBus } from "@app/cqrs";
import { singleton } from "@app/di";
import { roleSchema, UserId, UserIdSpecification, userIdSchema, UserRole, NotFoundException } from "@app/domain";
import { z } from "@app/zod";

import { type IOutboxService, injectOutboxService } from "../../outbox";
import { runWithDomainEvents } from "../../shared/run-with-domain-events";
import { type ApplicationTransactionPort, injectApplicationTransaction } from "../../transaction";
import type { IUserDTO } from "../user.dto";
import { UserMapper } from "../user.mapper";
import { type IUserRepository, injectUserRepo } from "../user.repository.port";

export const assignRoleCommand = z.object({
  userId: userIdSchema,
  role: roleSchema,
});

export type IAssignRoleCommand = z.infer<typeof assignRoleCommand>;

export class AssignRoleCommand extends Command implements IAssignRoleCommand {
  public readonly userId: string;
  public readonly role: IAssignRoleCommand["role"];

  constructor(props: IAssignRoleCommand) {
    super(props);
    this.userId = props.userId;
    this.role = props.role;
  }
}

/** Takes effect on the user's next request: the role is read from the user row, not the session. */
@commandHandler(AssignRoleCommand)
@singleton()
export class AssignRoleCommandHandler implements ICommandHandler<AssignRoleCommand, IUserDTO> {
  constructor(
    @injectUserRepo() private readonly userRepo: IUserRepository,
    @injectApplicationTransaction() private readonly transaction: ApplicationTransactionPort,
    @injectOutboxService() private readonly outboxService: IOutboxService,
    @injectEventBus() private readonly eventBus: IEventBus,
  ) {}

  async execute(command: AssignRoleCommand): Promise<IUserDTO> {
    const user = await runWithDomainEvents(this.transaction, this.outboxService, this.eventBus, async () => {
      const user = await this.userRepo.findOne(new UserIdSpecification(UserId.create(command.userId)));
      if (!user) throw new NotFoundException(`User ${command.userId} not found`);
      if (user.changeRole(UserRole.create(command.role))) await this.userRepo.update(user);
      return { result: user, events: user.clearDomainEvents() };
    });
    return UserMapper.toResponse(user);
  }
}
