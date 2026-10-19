"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { errorMessage, orpc, type Permissions, type Todo } from "./orpc";

const FILTERS = [undefined, "open", "completed", "archived"] as const;
type Filter = (typeof FILTERS)[number];

export function Todos({ permissions }: { permissions: Permissions }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>(undefined);
  const [title, setTitle] = useState("");

  const todos = useQuery({
    ...orpc.todo.list.queryOptions({ input: filter ? { status: filter } : {} }),
    // The completion notification is written by the BullMQ job a few seconds after "complete";
    // poll only while something is still waiting for it.
    refetchInterval: (query) =>
      query.state.data?.some((todo) => todo.status === "completed" && !todo.completionNotifiedAt) ? 1_000 : false,
  });

  // Every mutation invalidates all todo queries (every filter), via the router-level partial key.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: orpc.todo.key() });
  const create = useMutation(orpc.todo.create.mutationOptions({ onSuccess: () => (setTitle(""), invalidate()) }));
  const complete = useMutation(orpc.todo.complete.mutationOptions({ onSuccess: invalidate }));
  const archive = useMutation(orpc.todo.archive.mutationOptions({ onSuccess: invalidate }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({ title });
  };

  const error = errorMessage(create.error ?? complete.error ?? archive.error ?? todos.error);

  return (
    <div className="space-y-4">
      {permissions.todo?.includes("create") && (
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs doing?"
            aria-label="Todo title"
            className="flex-1 rounded border border-neutral-300 px-3 py-2"
          />
          <button type="submit" disabled={create.isPending} className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50">
            Add
          </button>
        </form>
      )}

      <nav className="flex gap-2 text-sm" aria-label="Filter">
        {FILTERS.map((value) => (
          <button
            key={value ?? "all"}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`rounded px-3 py-1 ${filter === value ? "bg-neutral-900 text-white" : "bg-neutral-200"}`}
          >
            {value ?? "all"}
          </button>
        ))}
      </nav>

      {error && (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {todos.isPending ? (
        <p className="text-neutral-500">Loading…</p>
      ) : todos.data?.length === 0 ? (
        <p className="text-neutral-500">Nothing here.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
          {todos.data?.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              busy={complete.isPending || archive.isPending}
              canComplete={permissions.todo?.includes("complete") ?? false}
              canArchive={permissions.todo?.includes("archive") ?? false}
              onComplete={() => complete.mutate({ todoId: todo.id })}
              onArchive={() => archive.mutate({ todoId: todo.id })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TodoRow({
  todo,
  busy,
  canComplete,
  canArchive,
  onComplete,
  onArchive,
}: {
  todo: Todo;
  busy: boolean;
  canComplete: boolean;
  canArchive: boolean;
  onComplete: () => void;
  onArchive: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2" data-testid="todo-row">
      <span className={`flex-1 ${todo.status === "open" ? "" : "text-neutral-400 line-through"}`}>{todo.title}</span>
      <span className="text-xs text-neutral-500" data-testid="todo-status">
        {todo.status}
        {todo.status === "completed" && (todo.completionNotifiedAt ? " · notified" : " · notifying…")}
      </span>
      {canComplete && todo.status === "open" && (
        <button type="button" disabled={busy} onClick={onComplete} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white">
          Complete
        </button>
      )}
      {canArchive && todo.status !== "archived" && (
        <button type="button" disabled={busy} onClick={onArchive} className="rounded bg-neutral-300 px-2 py-1 text-xs">
          Archive
        </button>
      )}
    </li>
  );
}
