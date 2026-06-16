/**
 * useNotifications — polls /v1/me/feature-requests/incoming every 15 s for
 * managers/big-bosses so the bell badge and dropdown stay up-to-date.
 *
 * Also listens for the custom DOM event `googenie:feature-request-updated`
 * which is dispatched by UserProfilePage immediately after a request is
 * created or decided, so both sides refresh without any page reload.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { meApi, type FeatureRequest } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { playChime } from "../lib/chime";

export interface NotificationsState {
  requests: FeatureRequest[];
  pendingCount: number;
  loading: boolean;
  refresh: () => void;
  decide: (id: number, decision: "approved" | "denied") => Promise<void>;
}

const POLL_INTERVAL_MS = 15_000;

// Single shared broadcast so any component can trigger a re-fetch in every
// other component listening (even across the notification panel and profile page).
export function broadcastRequestUpdate() {
  window.dispatchEvent(new CustomEvent("googenie:feature-request-updated"));
}

export function useNotifications(): NotificationsState {
  const { role } = useAuth();
  const isManager = role === "manager_admin" || role === "super_admin";

  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const latestRequests = useRef<FeatureRequest[]>([]);

  const load = useCallback(async () => {
    if (!isManager) return;
    try {
      const r = await meApi.getIncomingFeatureRequests();
      const next = JSON.stringify(r.requests);
      if (next !== JSON.stringify(latestRequests.current)) {
        // Detect genuinely new pending requests (not present before)
        const prevPendingIds = new Set(
          latestRequests.current.filter((x) => x.status === "pending").map((x) => x.id)
        );
        const newPending = r.requests.filter(
          (x) => x.status === "pending" && !prevPendingIds.has(x.id)
        );
        if (newPending.length > 0 && latestRequests.current.length > 0) {
          // Only chime on subsequent polls (not on initial load)
          playChime("in");
          // Browser notification if permission granted
          if (Notification.permission === "granted") {
            const first = newPending[0];
            const name = first.requester?.displayName ?? first.requester?.email ?? "Someone";
            const feat = first.feature_key.replace(/_/g, " ");
            new Notification("GooGenie — New Request", {
              body: `${name} requested access to ${feat}`,
              icon: "/favicon.svg",
              tag: `feature-request-${first.id}`,
            });
          }
        }
        latestRequests.current = r.requests;
        setRequests(r.requests);
      }
    } catch {
      // Swallow — non-critical background poll
    } finally {
      setLoading(false);
    }
  }, [isManager]);

  // Initial load + request browser notification permission
  useEffect(() => {
    if (!isManager) return;
    setLoading(true);
    load();
    // Ask for permission once — browsers only prompt if "default" (not yet decided)
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => null);
    }
  }, [isManager, load]);

  // Poll every 15 s
  useEffect(() => {
    if (!isManager) return;
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isManager, load]);

  // Listen for cross-component broadcast and refresh immediately
  useEffect(() => {
    window.addEventListener("googenie:feature-request-updated", load);
    return () => window.removeEventListener("googenie:feature-request-updated", load);
  }, [load]);

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const decide = useCallback(async (id: number, decision: "approved" | "denied") => {
    await meApi.decideFeatureRequest(id, decision);
    // Immediately refresh local state and broadcast to other components
    await load();
    broadcastRequestUpdate();
  }, [load]);

  return { requests, pendingCount, loading, refresh: load, decide };
}
