import { singleton } from "@app/di";
import { UserId, UserIdSpecification, userIdSchema, rolePermissions, SessionUserMissingError } from "@app/domain";
import { z } from "@app/zod";

import { defineQuery, type IRequestHandler, type RequestPayload } from "../../shared/mediator";
import { toUserDTO } from "../../user/user.mapper";
import { type IUserRepository, injectUserRepo } from "../../user/user.repository.port";
import type { ICurrentUserDTO } from "../auth.dto";

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
