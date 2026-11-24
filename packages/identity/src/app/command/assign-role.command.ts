import { type ApplicationTransactionPort, injectApplicationTransaction } from "@app/common/cqrs";
import { defineCommand, type IRequestHandler, type RequestPayload } from "@app/common/cqrs";
import { singleton } from "@app/common/di";
import { NotFoundException } from "@app/common/errors";
import { z } from "@app/common/zod";

import { type IUserRepository, injectUserRepo } from "../../adapters/user.repository";
import { roleSchema } from "../../domain/rbac/permissions";
import { UserIdSpecification } from "../../domain/user/specs/user-id.specification";
import { UserId, userIdSchema } from "../../domain/user/user-id.value-object";
import { UserRole } from "../../domain/user/user-role.value-object";
import type { IUserDTO } from "../user.dto";
import { toUserDTO } from "../user.mapper";

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
    @injectApplicationTransaction() private readonly transaction: ApplicationTransactionPort,
  ) {}

  async execute(command: AssignRoleCommand): Promise<IUserDTO> {
    const user = await this.transaction.run(async () => {
      const user = await this.userRepo.findOne(new UserIdSpecification(UserId.create(command.userId)));
      if (!user) throw new NotFoundException(`User ${command.userId} not found`);
      if (user.changeRole(UserRole.create(command.role))) await this.userRepo.update(user);
      return user;
    });
    return toUserDTO(user);
  }
}
