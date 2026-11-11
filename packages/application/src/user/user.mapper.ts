import { PasswordHash, UserEmail, UserEntity, UserId, UserRole } from "@app/domain";

import type { IUserDTO } from "./user.dto";
import type { UserRecord } from "./user.repository.port";

export function toUserEntity(record: UserRecord): UserEntity {
  return UserEntity.rehydrate({
    id: UserId.rehydrate(record.id),
    email: UserEmail.rehydrate(record.email),
    passwordHash: PasswordHash.rehydrate(record.password_hash),
    role: UserRole.rehydrate(record.role),
    createdAt: new Date(record.created_at),
    updatedAt: new Date(record.updated_at),
  });
}

export function toUserRecord(user: UserEntity): UserRecord {
  return {
    id: user.id.value,
    email: user.email.value,
    password_hash: user.passwordHash.value,
    role: user.role.value,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
}

/** Never includes the password hash. */
export function toUserDTO(user: UserEntity): IUserDTO {
  return {
    id: user.id.value,
    email: user.email.value,
    role: user.role.value,
    createdAt: user.createdAt.toISOString(),
  };
}
