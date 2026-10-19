"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { errorMessage, orpc } from "./orpc";
import { Todos } from "./todos";
import { Users } from "./users";

export function Account() {
  const queryClient = useQueryClient();
  const me = useQuery({ ...orpc.auth.me.queryOptions(), staleTime: 0 });

  // Never leave a previous user's private data in the cache across an account switch.
  const clearPrivateData = async () => {
    for (const key of [orpc.todo.key(), orpc.user.key()]) {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.removeQueries({ queryKey: key });
    }
  };
  const signedIn = async () => {
    await clearPrivateData();
    await queryClient.invalidateQueries({ queryKey: orpc.auth.me.key() });
  };
  const signedOut = async () => {
    queryClient.setQueryData(orpc.auth.me.queryOptions().queryKey, null);
    await clearPrivateData();
  };
  const signOut = useMutation(orpc.auth.signOut.mutationOptions({ onSuccess: signedOut }));
  const signOutAll = useMutation(orpc.auth.signOutAll.mutationOptions({ onSuccess: signedOut }));

  if (me.isPending) return <p>Checking session…</p>;
  if (me.isError) return <p role="alert">{errorMessage(me.error)}</p>;
  if (!me.data) return <SignInForm onSignedIn={signedIn} />;

  const { user, permissions } = me.data;
  const error = errorMessage(signOut.error ?? signOutAll.error);
  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded border border-neutral-200 bg-white p-3" aria-label="Account">
        <p className="text-sm">
          {user.email}{" "}
          <span className="rounded bg-neutral-100 px-2 py-1 text-xs" data-testid="current-role">
            {user.role}
          </span>
        </p>
        <div className="flex gap-4 text-sm">
          <button
            type="button"
            onClick={() => signOut.mutate(undefined)}
            disabled={signOut.isPending || signOutAll.isPending}
            className="underline"
          >
            Sign out
          </button>
          <button
            type="button"
            onClick={() => signOutAll.mutate(undefined)}
            disabled={signOut.isPending || signOutAll.isPending}
            className="underline"
          >
            Sign out all devices
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </section>
      {/* Visibility is UX only: the server checks RBAC independently on every procedure call. */}
      <Todos key={user.id} permissions={permissions} />
      {permissions.user?.includes("list") && <Users currentUserId={user.id} canAssignRole={permissions.user.includes("assignRole")} />}
    </div>
  );
}

function SignInForm({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const success = async () => {
    setPassword("");
    await onSignedIn();
  };
  // Auth mutations carry a plaintext password in `variables`; do not retain them after the form unmounts.
  const signIn = useMutation(orpc.auth.signIn.mutationOptions({ onSuccess: success, gcTime: 0 }));
  const signUp = useMutation(orpc.auth.signUp.mutationOptions({ onSuccess: success, gcTime: 0 }));
  const mutation = mode === "signIn" ? signIn : signUp;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({ email, password });
  };
  const toggle = () => {
    setMode(mode === "signIn" ? "signUp" : "signIn");
    signIn.reset();
    signUp.reset();
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded border border-neutral-200 bg-white p-4">
      <h2 className="font-semibold">{mode === "signIn" ? "Sign in" : "Create account"}</h2>
      <label className="block text-sm">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Password
        <input
          type="password"
          required
          autoComplete={mode === "signIn" ? "current-password" : "new-password"}
          minLength={mode === "signUp" ? 8 : undefined}
          maxLength={mode === "signUp" ? 100 : 256}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      {mode === "signUp" && (
        <p className="text-xs text-neutral-500">
          8–100 printable ASCII characters; no leading or trailing spaces. New accounts are members.
        </p>
      )}
      {mutation.error && (
        <p role="alert" className="text-sm text-red-700">
          {errorMessage(mutation.error)}
        </p>
      )}
      <div className="flex items-center gap-4 text-sm">
        <button type="submit" disabled={mutation.isPending} className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50">
          {mode === "signIn" ? "Sign in" : "Create account"}
        </button>
        <button type="button" disabled={mutation.isPending} onClick={toggle} className="underline">
          {mode === "signIn" ? "Create an account" : "Already have an account?"}
        </button>
      </div>
    </form>
  );
}
