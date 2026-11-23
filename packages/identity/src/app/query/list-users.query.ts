import { defineQuery, type IRequestHandler, type RequestPayload } from "@app/common/cqrs";
import { specificationBuilder } from "@app/common/ddd";
import { singleton } from "@app/common/di";
import { z } from "@app/common/zod";

import { type IUserRepository, injectUserRepo } from "../../adapters/user.repository";
import { UserEmailSpecification } from "../../domain/user/specs/user-email.specification";
import { UserEmail, userEmailSchema } from "../../domain/user/user-email.value-object";
import type { IUserState, UserEntity } from "../../domain/user/user.entity";
import type { IUserSpecVisitor } from "../../domain/user/user.type";
import type { IUserDTO } from "../user.dto";
import { toUserDTO } from "../user.mapper";

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
    return users.map(toUserDTO);
  }
}
