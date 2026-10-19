import type { IMapper } from "@app/core";
import { PasswordHash, UserEmail, UserEntity, UserId, UserRole } from "@app/domain";

import type { IUserDTO } from "./user.dto";
import type { UserRecord } from "./user.repository.port";

export const UserMapper: IMapper<UserEntity, UserRecord, IUserDTO> = {
  toEntity(record) {
    return UserEntity.rehydrate({
      id: UserId.rehydrate(record.id),
      email: UserEmail.rehydrate(record.email),
      passwordHash: PasswordHash.rehydrate(record.password_hash),
      role: UserRole.rehydrate(record.role),
      createdAt: new Date(record.created_at),
      updatedAt: new Date(record.updated_at),
    });
  },

  toPersistence(user) {
    return {
      id: user.id.value,
      email: user.email.value,
      password_hash: user.passwordHash.value,
      role: user.role.value,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    };
  },

  toResponse(user) {
    return {
      id: user.id.value,
      email: user.email.value,
      role: user.role.value,
      createdAt: user.createdAt.toISOString(),
    };
  },
};
