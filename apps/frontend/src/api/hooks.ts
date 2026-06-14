/**
 * React Query hooks for Gmail / Calendar.
 *
 * These give the app instant re-renders on revisit (cache hit) plus
 * silent background refreshes — the "feels instant" effect.
 *
 * Mutations include optimistic updates so the UI changes the moment
 * the user clicks, then reconciles when the server responds.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { emailApi, calendarApi, type EmailThread, type CalendarEvent } from "./client.ts";
import { qk, queryClient } from "./queryClient.ts";

// ── Reads ──────────────────────────────────────────────────────────────────

export function useEmailThreads(opts: { q?: string; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.emailThreads(opts.q),
    queryFn: () => emailApi.listThreads({ q: opts.q || undefined }),
    enabled: opts.enabled !== false,
    // Background refetch every 60s while tab is visible
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useCalendarEvents(opts: { q?: string; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.calendarEvents(opts.q),
    queryFn: () => calendarApi.listEvents({ q: opts.q || undefined }),
    enabled: opts.enabled !== false,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

// ── Mutations with optimistic updates ──────────────────────────────────────

/**
 * Mark a thread as read locally before the server responds.
 * Rolls back on failure; reconciles on success.
 */
export function useMarkThreadRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) =>
      emailApi.modifyLabels(threadId, { add_label_ids: [], remove_label_ids: ["UNREAD"] }),

    onMutate: async (threadId) => {
      await qc.cancelQueries({ queryKey: ["email", "threads"] });
      const snapshots = qc.getQueriesData<{ threads: EmailThread[] }>({ queryKey: ["email", "threads"] });
      // Apply optimistic update to every cached thread list
      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData(key, {
          ...data,
          threads: data.threads.map((t) =>
            t.id === threadId
              ? { ...t, isUnread: false, labelIds: (t.labelIds ?? []).filter((l) => l !== "UNREAD") }
              : t
          ),
        });
      }
      return { snapshots };
    },

    onError: (_err, _threadId, ctx) => {
      // Roll back
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["email", "threads"] });
    },
  });
}

export function useTrashThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => emailApi.trash(threadId),

    onMutate: async (threadId) => {
      await qc.cancelQueries({ queryKey: ["email", "threads"] });
      const snapshots = qc.getQueriesData<{ threads: EmailThread[]; total: number }>({ queryKey: ["email", "threads"] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData(key, {
          ...data,
          threads: data.threads.filter((t) => t.id !== threadId),
          total: Math.max(0, (data.total ?? data.threads.length) - 1),
        });
      }
      return { snapshots };
    },

    onError: (_err, _id, ctx) => ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["email", "threads"] }),
  });
}

export function useDeleteCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => calendarApi.deleteEvent(eventId),

    onMutate: async (eventId) => {
      await qc.cancelQueries({ queryKey: ["calendar", "events"] });
      const snapshots = qc.getQueriesData<{ events: CalendarEvent[]; total: number }>({ queryKey: ["calendar", "events"] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData(key, {
          ...data,
          events: data.events.filter((e) => e.id !== eventId),
          total: Math.max(0, (data.total ?? data.events.length) - 1),
        });
      }
      return { snapshots };
    },

    onError: (_err, _id, ctx) => ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["calendar", "events"] }),
  });
}

export function useCreateCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; starts_at: string; ends_at: string; attendees: string[]; description?: string; location?: string }) =>
      calendarApi.createEvent(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar", "events"] }),
  });
}

export function useUpdateCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; body: { title?: string; starts_at?: string; ends_at?: string; attendees?: string[]; description?: string; location?: string } }) =>
      calendarApi.updateEvent(input.id, input.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar", "events"] }),
  });
}

export function useSendEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { to: string; subject: string; body: string }) => emailApi.send(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email", "threads"] }),
  });
}

export function useReplyToThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { threadId: string; body: { to: string; subject: string; body: string; message_id?: string } }) =>
      emailApi.reply(input.threadId, input.body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["email", "threads"] });
      qc.invalidateQueries({ queryKey: qk.emailThread(vars.threadId) });
    },
  });
}

// ── Prefetch helpers — call after sign-in for instant first paint ──────────

export async function prefetchUserData() {
  // Fire-and-forget: warms the cache so the first nav to /inbox or /calendar
  // is rendered from cache (0 ms) while a refetch happens in the background.
  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: [...qk.emailThreads()],
      queryFn: () => emailApi.listThreads({}),
    }),
    queryClient.prefetchQuery({
      queryKey: [...qk.calendarEvents()],
      queryFn: () => calendarApi.listEvents({}),
    }),
  ]);
}
