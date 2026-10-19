import { specificationBuilder } from "@app/core";
import { type IQueryHandler, Query, queryHandler } from "@app/cqrs";
import { singleton } from "@app/di";
import { type IUserSpecVisitor, UserEmail, UserEmailSpecification, userEmailSchema, type UserEntity } from "@app/domain";
import { z } from "@app/zod";

import type { IUserDTO } from "../user.dto";
import { UserMapper } from "../user.mapper";
import { type IUserRepository, injectUserRepo } from "../user.repository.port";

export const listUsersQuery = z.object({
  email: userEmailSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export type IListUsersQuery = z.input<typeof listUsersQuery>;

export class ListUsersQuery extends Query {
  public readonly email?: string;
  public readonly limit: number;

  constructor(props: IListUsersQuery = {}) {
    super();
    const parsed = listUsersQuery.parse(props);
    this.email = parsed.email;
    this.limit = parsed.limit;
  }
}

@queryHandler(ListUsersQuery)
@singleton()
export class ListUsersQueryHandler implements IQueryHandler<ListUsersQuery, IUserDTO[]> {
  constructor(@injectUserRepo() private readonly userRepo: IUserRepository) {}

  async execute(query: ListUsersQuery): Promise<IUserDTO[]> {
    const spec = specificationBuilder<UserEntity, IUserSpecVisitor>().add(query.email, UserEmail.create, UserEmailSpecification).build();
    const users = await this.userRepo.find(spec, { limit: query.limit });
    return users.map((user) => UserMapper.toResponse(user));
  }
}
