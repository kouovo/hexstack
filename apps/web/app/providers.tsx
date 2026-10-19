"use client";

import { ORPCError } from "@orpc/client";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { orpc } from "./orpc";

export function Providers({ children }: { children: ReactNode }) {
  // One client per browser session; useState keeps it stable across re-renders.
  const [queryClient] = useState(() => {
    const recheckIdentity = (error: Error) => {
      if (error instanceof ORPCError && (error.status === 401 || error.status === 403)) {
        void client.invalidateQueries({ queryKey: orpc.auth.me.key() });
      }
    };
    const client = new QueryClient({
      queryCache: new QueryCache({ onError: recheckIdentity }),
      mutationCache: new MutationCache({ onError: recheckIdentity }),
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          retry: (attempt, error) => attempt < 2 && !(error instanceof ORPCError && [401, 403, 429].includes(error.status)),
        },
      },
    });
    return client;
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
