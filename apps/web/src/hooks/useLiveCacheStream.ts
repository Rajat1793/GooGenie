/**
 * Live cache stream — listens to backend SSE pushes and invalidates the
 * matching React Query keys so the UI refreshes silently.
 *
 * Effect: when a Gmail webhook (or another tab) modifies the user's data,
 * the inbox/calendar refetches without the user having to do anything.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth as useClerkAuth } from "@clerk/nextjs";
import { getDemoToken } from "../api/client";
import { playChime } from "../lib/chime";
import { broadcastRequestUpdate } from "./useNotifications";

// Same-origin under Next.js; SSE lives at /api/v1/stream.
const BASE = "";

export function useLiveCacheStream() {
  const qc = useQueryClient();
  const { getToken, isSignedIn } = useClerkAuth();

  useEffect(() => {
    if (!isSignedIn && !getDemoToken()) return;

    // Request browser notification permission for all users so students also
    // receive OS-level notifications when their requests are decided
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => null);
    }

    let cancelled = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let abortCtrl: AbortController | null = null;
    // Exponential backoff with jitter — capped at 30s — so a server restart
    // (Next.js HMR, deploy) doesn't spam the network panel with retry
    // attempts every 3 seconds. Resets to 1s after a successful connection.
    let backoffMs = 1_000;

    async function connect() {
      const token = getDemoToken() ?? (await getToken().catch(() => null));
      if (!token || cancelled) return;

      abortCtrl = new AbortController();
      try {
        // EventSource doesn't support custom headers, so we use fetch + a
        // streaming reader. This is the standard SSE-with-auth pattern.
        const res = await fetch(`${BASE}/api/v1/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
          signal: abortCtrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Stream HTTP ${res.status}`);

        // Reset backoff once we successfully reach the server.
        backoffMs = 1_000;

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
        // Network drop / server restart / abort — silent retry with backoff.
      } finally {
        if (!cancelled) {
          const jitter = Math.random() * 500;
          retryTimeout = setTimeout(connect, backoffMs + jitter);
          backoffMs = Math.min(backoffMs * 2, 30_000);
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (abortCtrl) abortCtrl.abort();
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
      // User-initiated mutation (mark read, label, trash, reply, send) from
      // another tab/device — invalidate caches silently. No toast, no chime.
      qc.invalidateQueries({ queryKey: ["email", "threads"] });
      try {
        const parsed = JSON.parse(data) as { threadId?: string };
        if (parsed.threadId) qc.invalidateQueries({ queryKey: ["email", "thread", parsed.threadId] });
      } catch { /* ignore */ }
      break;
    case "email.received":
      // Webhook-driven new mail — surface a visible cue.
      qc.invalidateQueries({ queryKey: ["email", "threads"] });
      try {
        const parsed = JSON.parse(data) as { threadId?: string };
        if (parsed.threadId) qc.invalidateQueries({ queryKey: ["email", "thread", parsed.threadId] });
      } catch { /* ignore */ }
      playChime("in");
      window.dispatchEvent(new CustomEvent("googenie:toast", {
        detail: { message: "📬 New mail just arrived", icon: "mail" },
      }));
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
        new Notification("GooGenie — New mail", { body: "Your inbox just updated.", icon: "/favicon.svg" });
      }
      break;
    case "calendar.changed":
      // Silent invalidate for user-initiated calendar mutations.
      qc.invalidateQueries({ queryKey: ["calendar", "events"] });
      try {
        const parsed = JSON.parse(data) as { eventId?: string };
        if (parsed.eventId) qc.invalidateQueries({ queryKey: ["calendar", "event", parsed.eventId] });
      } catch { /* ignore */ }
      break;
    case "calendar.received":
      qc.invalidateQueries({ queryKey: ["calendar", "events"] });
      try {
        const parsed = JSON.parse(data) as { eventId?: string };
        if (parsed.eventId) qc.invalidateQueries({ queryKey: ["calendar", "event", parsed.eventId] });
      } catch { /* ignore */ }
      playChime("in");
      window.dispatchEvent(new CustomEvent("googenie:toast", {
        detail: { message: "📅 Calendar updated", icon: "event" },
      }));
      break;
    case "feature.request.created":
      // Manager receives this — refresh their notification bell immediately
      try {
        const parsed = JSON.parse(data) as { requesterName: string; featureKey: string };
        playChime("in");
        broadcastRequestUpdate();
        // Browser notification for manager
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("GooGenie — New Request", {
            body: `${parsed.requesterName} requested access to ${parsed.featureKey.replace(/_/g, " ")}`,
            icon: "/favicon.svg",
          });
        }
      } catch { /* ignore */ }
      break;
    case "feature.request.decided":
      // Requester (student/teacher) receives this — refresh features + chime
      try {
        const parsed = JSON.parse(data) as { featureKey: string; decision: "approved" | "denied" };
        playChime("out");
        broadcastRequestUpdate();
        // Browser notification for requester
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const feat = parsed.featureKey.replace(/_/g, " ");
          const approved = parsed.decision === "approved";
          new Notification(approved ? "GooGenie — Access Granted ✓" : "GooGenie — Request Denied", {
            body: approved
              ? `You now have access to: ${feat}`
              : `Your request for ${feat} was denied`,
            icon: "/favicon.svg",
          });
        }
      } catch { /* ignore */ }
      break;
    default:
      // hello / ping / unknown — ignored
      break;
  }
}
