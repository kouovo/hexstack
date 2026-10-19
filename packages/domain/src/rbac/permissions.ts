import { z } from "@app/zod";

/**
 * Every permission in the system: resource -> actions.
 * Add a resource here when you add a bounded context; tsc then forces each role map to stay valid.
 */
export const statements = {
  todo: ["create", "read", "complete", "archive"],
  user: ["list", "assignRole"],
} as const;

export type PermissionStatements = typeof statements;
export type PermissionResource = keyof PermissionStatements;
/** A set of required (or granted) permissions, e.g. `{ todo: ["complete"] }`. */
export type Permissions = { [R in PermissionResource]?: readonly PermissionStatements[R][number][] };

export const roleSchema = z.enum(["admin", "member", "viewer"]);
export type RoleValue = z.infer<typeof roleSchema>;

/** Role -> granted permissions. The only place that decides who may do what. */
export const rolePermissions = {
  admin: {
    todo: ["create", "read", "complete", "archive"],
    user: ["list", "assignRole"],
  },
  member: {
    todo: ["create", "read", "complete"],
  },
  viewer: {
    todo: ["read"],
  },
} as const satisfies Record<RoleValue, Permissions>;

/** True when `role` is granted every action in `required`. Unknown roles get nothing. */
export function roleHasPermissions(role: string, required: Permissions): boolean {
  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return false;
  const granted: Permissions = rolePermissions[parsed.data];
  return Object.entries(required).every(([resource, actions]) => {
    const allowed = (granted[resource as PermissionResource] ?? []) as readonly string[];
    return (actions ?? []).every((action) => allowed.includes(action));
  });
}
