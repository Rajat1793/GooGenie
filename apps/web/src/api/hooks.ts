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
import { emailApi, calendarApi, meApi, type EmailThread, type CalendarEvent } from "./client";
import { qk, queryClient } from "./queryClient";

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
      // Roll back only if not a 429 — on 429 the server didn't process the
      // request so the thread is still unread; roll back is correct.
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },

    // No onSuccess invalidation: the optimistic update is already applied and
    // a background refetch every 60s will reconcile any drift.
    // Firing invalidateQueries here would immediately trigger an extra GET and
    // amplify rate-limit consumption.
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

    // On error (e.g. 429): roll back the optimistic removal so the thread
    // reappears in the list. Don't fire an extra GET — that would create
    // another 429 and extend the outage.
    onError: (_err, _id, ctx) => ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data)),

    // On success: the item is already gone from the cache optimistically.
    // Schedule a background reconciliation refetch after a short delay so any
    // server-side cascade (e.g. thread count update) is picked up without
    // hammering the API immediately.
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: ["email", "threads"] }), 1500);
    },
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
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: ["calendar", "events"] }), 1500);
    },
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
  // Resolve feature flags FIRST so we only warm caches the user can actually
  // read. Without this gate, students (who don't have `calendar_read`) would
  // hit /api/v1/calendar/events and the browser network panel logs the 403,
  // creating user-visible noise even though the request is gracefully
  // handled. Email reads are typically open, calendar requires `calendar_read`.
  let features: Array<{ featureKey: string; isEnabled: boolean }> = [];
  try {
    const r = await meApi.getFeatures();
    features = r.features ?? [];
  } catch {
    /* fall through — assume open access if we can't resolve */
  }
  const allowed = (key: string) => {
    const f = features.find((x) => x.featureKey === key);
    return !f || f.isEnabled; // default open if no record
  };

  const tasks: Array<Promise<unknown>> = [];
  if (allowed("email_read")) {
    tasks.push(
      queryClient.prefetchQuery({
        queryKey: [...qk.emailThreads()],
        queryFn: () => emailApi.listThreads({}),
      })
    );
  }
  if (allowed("calendar_read")) {
    tasks.push(
      queryClient.prefetchQuery({
        queryKey: [...qk.calendarEvents()],
        queryFn: () => calendarApi.listEvents({}),
      })
    );
  }
  await Promise.allSettled(tasks);
}
