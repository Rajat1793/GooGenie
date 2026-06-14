/**
 * Live cache stream — listens to backend SSE pushes and invalidates the
 * matching React Query keys so the UI refreshes silently.
 *
 * Effect: when a Gmail webhook (or another tab) modifies the user's data,
 * the inbox/calendar refetches without the user having to do anything.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth as useClerkAuth } from "@clerk/react";
import { getDemoToken } from "../api/client.ts";

const BASE = import.meta.env.VITE_API_URL ?? "";

export function useLiveCacheStream() {
  const qc = useQueryClient();
  const { getToken, isSignedIn } = useClerkAuth();

  useEffect(() => {
    if (!isSignedIn && !getDemoToken()) return;

    let cancelled = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      const token = getDemoToken() ?? (await getToken().catch(() => null));
      if (!token || cancelled) return;

      try {
        // EventSource doesn't support custom headers, so we use fetch + a
        // streaming reader. This is the standard SSE-with-auth pattern.
        const res = await fetch(`${BASE}/v1/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          // Long-lived connection
          credentials: "include",
        });
        if (!res.ok || !res.body) throw new Error(`Stream HTTP ${res.status}`);

        reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Parse SSE frames separated by blank lines
          let idx;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            handleFrame(frame, qc);
          }
        }
      } catch {
        // Network drop — retry after a short backoff
      } finally {
        if (!cancelled) {
          retryTimeout = setTimeout(connect, 3_000);
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (reader) reader.cancel().catch(() => null);
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [getToken, isSignedIn, qc]);
}

function handleFrame(frame: string, qc: ReturnType<typeof useQueryClient>) {
  const lines = frame.split("\n");
  let eventName = "message";
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
    // ignore comments / heartbeats
  }
  if (!data) return;

  switch (eventName) {
    case "email.changed":
      qc.invalidateQueries({ queryKey: ["email", "threads"] });
      try {
        const parsed = JSON.parse(data) as { threadId?: string };
        if (parsed.threadId) qc.invalidateQueries({ queryKey: ["email", "thread", parsed.threadId] });
      } catch { /* ignore */ }
      break;
    case "calendar.changed":
      qc.invalidateQueries({ queryKey: ["calendar", "events"] });
      try {
        const parsed = JSON.parse(data) as { eventId?: string };
        if (parsed.eventId) qc.invalidateQueries({ queryKey: ["calendar", "event", parsed.eventId] });
      } catch { /* ignore */ }
      break;
    default:
      // hello / ping / unknown — ignored
      break;
  }
}
