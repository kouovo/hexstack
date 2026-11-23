import { Specification } from "@app/common/ddd";

import type { IUserState, UserEntity } from "../user.entity";
import type { IUserSpecVisitor } from "../user.type";

export abstract class UserSpecification extends Specification<UserEntity, IUserSpecVisitor, IUserState> {}
