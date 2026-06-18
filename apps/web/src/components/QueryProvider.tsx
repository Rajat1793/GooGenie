"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { ApiError } from "../api/client";

/**
 * Per-request-safe React Query provider with localStorage persistence.
 *
 * Why persistence: Next.js dev mode JIT-compiles every API route on first
 * hit, so a hard page reload turns into a 3-5s blank screen while every
 * query refetches. Persisting the React Query cache to localStorage means
 * the moment the app mounts we render the LAST KNOWN data instantly, then
 * silently refetch in the background. The UI never shows a spinner unless
 * the cache is genuinely cold (first ever visit).
 *
 * - `gcTime: 24h`     — keep data in memory long enough to be persisted.
 * - `maxAge: 24h`     — drop persisted data older than a day on restore.
 * - `buster`          — bump this string to invalidate the entire persisted
 *                       cache when query shapes change between deploys.
 *
 * Constructing the QueryClient inside useState ensures one client per render
 * tree — critical for Next.js SSR where multiple requests share the module.
 */
const CACHE_BUSTER = "v2-2026-06-18";
const ONE_DAY = 1000 * 60 * 60 * 24;

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Keep data resident long enough for the persister to pick it up
            // AND for revisits within a day to hit cache.
            gcTime: ONE_DAY,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            // Persisted-cache UX: render persisted data immediately even if
            // stale, then refetch silently. Without this, React Query waits
            // for the network before showing anything.
            refetchOnMount: "always",
            retry: (failureCount, error) => {
              const status = (error as ApiError)?.status;
              if (status === 429) return false;
              if (status === 401) return failureCount < 2;
              return failureCount < 1;
            },
          },
          mutations: { retry: 0 },
        },
      })
  );

  // Build the persister only in the browser — localStorage doesn't exist on
  // the server. During SSR we fall back to the plain provider so the dehydrated
  // HTML matches what the persisted-provider renders on first client commit.
  const [persister] = useState(() => {
    if (typeof window === "undefined") return null;
    return createSyncStoragePersister({
      storage: window.localStorage,
      key: "googenie-query-cache",
      // Throttle writes — react-query fires lots of cache updates per second.
      throttleTime: 1000,
    });
  });

  if (!persister) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: ONE_DAY,
        buster: CACHE_BUSTER,
        // Only persist successful queries — failed queries shouldn't leak
        // an error state across page loads.
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => q.state.status === "success",
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
