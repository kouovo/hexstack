import { defineQuery, type IRequestHandler, type RequestPayload } from "@app/common/cqrs";
import { singleton } from "@app/common/di";
import { z } from "@app/common/zod";

import { type IUserRepository, injectUserRepo } from "../../adapters/user.repository";
import { SessionUserMissingError } from "../../domain/auth.errors";
import { rolePermissions } from "../../domain/rbac/permissions";
import { UserIdSpecification } from "../../domain/user/specs/user-id.specification";
import { UserId, userIdSchema } from "../../domain/user/user-id.value-object";
import type { ICurrentUserDTO } from "../auth.dto";
import { toUserDTO } from "../user.mapper";

export const GetCurrentUserQuery = defineQuery("auth.current-user", z.object({ userId: userIdSchema })).returns<ICurrentUserDTO>();
export type GetCurrentUserQuery = RequestPayload<typeof GetCurrentUserQuery>;

/** The signed-in user plus their effective permissions, so clients can hide what they cannot do. */
@singleton()
export class GetCurrentUserQueryHandler implements IRequestHandler<typeof GetCurrentUserQuery> {
  constructor(@injectUserRepo() private readonly users: IUserRepository) {}

  async execute(query: GetCurrentUserQuery): Promise<ICurrentUserDTO> {
    const user = await this.users.findOne(new UserIdSpecification(UserId.create(query.userId)));
    if (!user) throw new SessionUserMissingError({ userId: query.userId });
    return { user: toUserDTO(user), permissions: rolePermissions[user.role.value] };
  }
}
