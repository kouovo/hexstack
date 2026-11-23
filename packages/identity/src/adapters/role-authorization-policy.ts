import type { AuthorizationPolicy, Permissions } from "@app/common/auth";

import { roleHasPermissions } from "../domain/rbac/permissions";

/** Answers common's authorization port from the identity context's role → permission table. */
export class RoleAuthorizationPolicy implements AuthorizationPolicy {
  roleHasPermissions(role: string, required: Permissions): boolean {
    return roleHasPermissions(role, required);
  }
}
