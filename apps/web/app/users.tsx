"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage, orpc, type CurrentUser } from "./orpc";

const ROLES = ["admin", "member", "viewer"] as const satisfies readonly CurrentUser["user"]["role"][];

/** Small admin-only example. Server-side user:list / user:assignRole permissions are authoritative. */
export function Users({ currentUserId, canAssignRole }: { currentUserId: string; canAssignRole: boolean }) {
  const queryClient = useQueryClient();
  const users = useQuery(orpc.user.list.queryOptions({ input: { limit: 100 } }));
  const assignRole = useMutation(
    orpc.user.assignRole.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.user.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.auth.me.key() });
      },
    }),
  );
  const error = errorMessage(users.error ?? assignRole.error);

  return (
    <section className="space-y-3 border-t border-neutral-200 pt-4" aria-label="User administration">
      <h2 className="font-semibold">Users</h2>
      <p className="text-xs text-neutral-500">
        Role changes take effect on the next request. Demoting yourself removes admin access; an operator can restore it with the CLI.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {users.isPending ? (
        <p>Loading users…</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
          {users.data?.map((user) => (
            <li key={user.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1">
                {user.email}
                {user.id === currentUserId ? " (you)" : ""}
              </span>
              <select
                aria-label={`Role for ${user.email}`}
                value={user.role}
                disabled={!canAssignRole || assignRole.isPending}
                onChange={(e) => assignRole.mutate({ userId: user.id, role: e.target.value as CurrentUser["user"]["role"] })}
                className="rounded border border-neutral-300 px-2 py-1"
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
