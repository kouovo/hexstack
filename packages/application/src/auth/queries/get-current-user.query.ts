import { type IQueryHandler, Query, queryHandler } from "@app/cqrs";
import { singleton } from "@app/di";
import { UserId, UserIdSpecification, rolePermissions, SessionUserMissingError } from "@app/domain";

import { UserMapper } from "../../user/user.mapper";
import { type IUserRepository, injectUserRepo } from "../../user/user.repository.port";
import type { ICurrentUserDTO } from "../auth.dto";

export class GetCurrentUserQuery extends Query {
  constructor(public readonly userId: string) {
    super();
  }
}

/** The signed-in user plus their effective permissions, so clients can hide what they cannot do. */
@queryHandler(GetCurrentUserQuery)
@singleton()
export class GetCurrentUserQueryHandler implements IQueryHandler<GetCurrentUserQuery, ICurrentUserDTO> {
  constructor(@injectUserRepo() private readonly users: IUserRepository) {}

  async execute(query: GetCurrentUserQuery): Promise<ICurrentUserDTO> {
    const user = await this.users.findOne(new UserIdSpecification(UserId.create(query.userId)));
    if (!user) throw new SessionUserMissingError({ userId: query.userId });
    return { user: UserMapper.toResponse(user), permissions: rolePermissions[user.role.value] };
  }
}
