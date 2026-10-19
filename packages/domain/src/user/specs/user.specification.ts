import { Specification } from "@app/core";

import type { UserEntity } from "../user.entity";
import type { IUserSpecVisitor } from "../user.type";

export abstract class UserSpecification extends Specification<UserEntity, IUserSpecVisitor> {}
