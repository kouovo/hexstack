import type { Permissions } from "@app/domain";

import type { IUserDTO } from "../user/user.dto";

/** Returned by sign-up / sign-in. The transport turns `token` into a cookie and must not echo it in the body. */
export interface AuthResult {
  user: IUserDTO;
  token: string;
  expiresAt: Date;
}

export interface ICurrentUserDTO {
  user: IUserDTO;
  permissions: Permissions;
}
