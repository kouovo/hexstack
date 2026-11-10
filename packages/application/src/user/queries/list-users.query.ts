import { specificationBuilder } from "@app/core";
import { singleton } from "@app/di";
import { type IUserSpecVisitor, type IUserState, UserEmail, UserEmailSpecification, userEmailSchema, type UserEntity } from "@app/domain";
import { z } from "@app/zod";

import { defineQuery, type IRequestHandler, type RequestPayload } from "../../shared/mediator";
import type { IUserDTO } from "../user.dto";
import { UserMapper } from "../user.mapper";
import { type IUserRepository, injectUserRepo } from "../user.repository.port";

export const listUsersQuery = z.object({
  email: userEmailSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export type IListUsersQuery = z.input<typeof listUsersQuery>;

export const ListUsersQuery = defineQuery("user.list", listUsersQuery).returns<IUserDTO[]>();
export type ListUsersQuery = RequestPayload<typeof ListUsersQuery>;

@singleton()
export class ListUsersQueryHandler implements IRequestHandler<typeof ListUsersQuery> {
  constructor(@injectUserRepo() private readonly userRepo: IUserRepository) {}

  async execute(query: ListUsersQuery): Promise<IUserDTO[]> {
    const spec = specificationBuilder<UserEntity, IUserSpecVisitor, IUserState>()
      .add(query.email, UserEmail.create, UserEmailSpecification)
      .build();
    const users = await this.userRepo.find(spec, { limit: query.limit });
    return users.map((user) => UserMapper.toResponse(user));
  }
}
