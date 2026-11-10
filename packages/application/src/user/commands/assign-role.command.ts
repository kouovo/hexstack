import { singleton } from "@app/di";
import { roleSchema, UserId, UserIdSpecification, userIdSchema, UserRole, NotFoundException } from "@app/domain";
import { z } from "@app/zod";

import { type DomainEventScope, injectDomainEventScope } from "../../shared/domain-event-scope";
import { defineCommand, type IRequestHandler, type RequestPayload } from "../../shared/mediator";
import type { IUserDTO } from "../user.dto";
import { UserMapper } from "../user.mapper";
import { type IUserRepository, injectUserRepo } from "../user.repository.port";

export const assignRoleCommand = z.object({
  userId: userIdSchema,
  role: roleSchema,
});

export type IAssignRoleCommand = z.infer<typeof assignRoleCommand>;

export const AssignRoleCommand = defineCommand("user.assign-role", assignRoleCommand).returns<IUserDTO>();
export type AssignRoleCommand = RequestPayload<typeof AssignRoleCommand>;

/** Takes effect on the user's next request: the role is read from the user row, not the session. */
@singleton()
export class AssignRoleCommandHandler implements IRequestHandler<typeof AssignRoleCommand> {
  constructor(
    @injectUserRepo() private readonly userRepo: IUserRepository,
    @injectDomainEventScope() private readonly events: DomainEventScope,
  ) {}

  async execute(command: AssignRoleCommand): Promise<IUserDTO> {
    const user = await this.events.run(async (track) => {
      const user = await this.userRepo.findOne(new UserIdSpecification(UserId.create(command.userId)));
      if (!user) throw new NotFoundException(`User ${command.userId} not found`);
      if (user.changeRole(UserRole.create(command.role))) await this.userRepo.update(user);
      track(user);
      return user;
    });
    return UserMapper.toResponse(user);
  }
}
