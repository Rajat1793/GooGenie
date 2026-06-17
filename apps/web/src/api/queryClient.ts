/**
 * Centralised TanStack Query client + cache-key factory.
 *
 * Why this matters for "near zero latency":
 *   - In-memory cache: re-visiting the inbox / calendar shows data instantly
 *     while a background refetch keeps it fresh.
 *   - Dedup: 5 components asking for "threads" within 60 s = 1 HTTP call.
 *   - Refetch-on-focus: tab regains focus → silently refresh.
 *   - Optimistic updates: mutations apply immediately in the UI.
 */
import { QueryClient } from "@tanstack/react-query";
import type { ApiError } from "./client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is "fresh" for 30s — within that window, no refetch on remount.
      staleTime: 30_000,
      // Keep last successful data for 5 min even after components unmount,
      // so navigating back is instant.
      gcTime: 5 * 60_000,
      // Disabled: focus-refetch fires on every tab-switch and popup close.
      // With 100-300 req/min limits, background polls every 60s are sufficient.
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        const status = (error as ApiError)?.status;
        // Never retry 429s — backing off is handled by the 60s background poll.
        if (status === 429) return false;
        // Retry 401s up to 2 times — covers the JWKS cold-start window on local
        // where the first batch of requests arrive before Clerk's JWKS is cached.
        if (status === 401) return failureCount < 2;
        return failureCount < 1;
      },
    },
    mutations: {
      retry: 0,
    },
  },
});

/** Stable cache-key factory — keep all key shapes in one place. */
export const qk = {
  emailThreads: (q?: string) => ["email", "threads", { q: q ?? "" }] as const,
  emailThread: (id: string) => ["email", "thread", id] as const,
  calendarEvents: (q?: string) => ["calendar", "events", { q: q ?? "" }] as const,
  calendarEvent: (id: string) => ["calendar", "event", id] as const,
  connectStatus: () => ["connect", "status"] as const,
  meProfile: () => ["me", "profile"] as const,
};
