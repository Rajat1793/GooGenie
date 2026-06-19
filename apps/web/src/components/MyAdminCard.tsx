"use client";

/**
 * MyAdminCard — Profile-page widget rendered only for `manager_admin` users.
 *
 * Shows the currently-assigned Big Boss (if any) and lets the manager open
 * the global AdminSelectModal (mounted in Shell.tsx) to pick or change one.
 *
 * Listens for `googenie:admin-changed` so the displayed name updates
 * immediately after the modal saves a new selection.
 */

import { useCallback, useEffect, useState } from "react";
import { authApi2 } from "../api/client";
import { Icon } from "./Icon";

interface Boss {
  id: string;
  displayName: string;
  email: string;
}

export function MyAdminCard() {
  const [loading, setLoading] = useState(true);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [bosses, setBosses] = useState<Boss[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([authApi2.me(), authApi2.bosses()])
      .then(([meRes, bossesRes]) => {
        setCurrentId(meRes.user.managerUserId ?? null);
        setBosses(bossesRes.bosses);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load admin info.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function onChanged() {
      refresh();
    }
    window.addEventListener("googenie:admin-changed", onChanged);
    return () => window.removeEventListener("googenie:admin-changed", onChanged);
  }, [refresh]);

  const currentBoss = currentId ? bosses.find((b) => b.id === currentId) : null;
  const buttonLabel = currentBoss ? "Change Admin" : "Pick my Admin";

  return (
    <div className="mb-6 px-4 py-3 rounded-xl border bg-surface-container-low border-outline-variant/30 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-primary-container text-on-primary-container">
        <Icon name="shield_person" className="text-base" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
          My Admin
        </p>
        {loading ? (
          <p className="text-sm text-on-surface-variant">Loading…</p>
        ) : error ? (
          <p className="text-sm text-error">{error}</p>
        ) : currentBoss ? (
          <p className="text-sm text-ink-text">
            <span className="font-medium">{currentBoss.displayName}</span>
            <span className="text-on-surface-variant"> · {currentBoss.email}</span>
          </p>
        ) : currentId ? (
          <p className="text-sm text-on-surface-variant">
            Assigned (id: {currentId}) — not in your current admin list.
          </p>
        ) : (
          <p className="text-sm text-on-surface-variant">
            No admin assigned yet. Pick a Big Boss so they can manage your access.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(new CustomEvent("googenie:admin-select.open"))
        }
        className="btn-secondary text-xs px-3 py-1.5 flex-shrink-0"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
