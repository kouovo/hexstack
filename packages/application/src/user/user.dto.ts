import type { RoleValue } from "@app/domain";

/** Public shape of a user. Deliberately has no password hash. */
export interface IUserDTO {
  id: string;
  email: string;
  role: RoleValue;
  createdAt: string;
}
