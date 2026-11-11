import { z } from "@app/zod";

/** Add a resource per bounded context; tsc keeps every role map valid. */
export const statements = {
  todo: ["create", "read", "complete", "archive"],
  user: ["list", "assignRole"],
} as const;

export type PermissionStatements = typeof statements;
export type PermissionResource = keyof PermissionStatements;
export type Permissions = { [R in PermissionResource]?: readonly PermissionStatements[R][number][] };

export const roleSchema = z.enum(["admin", "member", "viewer"]);
export type RoleValue = z.infer<typeof roleSchema>;

/** The only place that decides who may do what. */
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

/** Unknown roles get nothing. */
export function roleHasPermissions(role: string, required: Permissions): boolean {
  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return false;
  const granted: Permissions = rolePermissions[parsed.data];
  return Object.entries(required).every(([resource, actions]) => {
    const allowed = (granted[resource as PermissionResource] ?? []) as readonly string[];
    return (actions ?? []).every((action) => allowed.includes(action));
  });
}
