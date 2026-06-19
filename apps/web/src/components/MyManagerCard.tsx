"use client";

/**
 * MyManagerCard — Profile-page widget rendered only for `user` (student)
 * accounts.
 *
 * Shows the currently-assigned Teacher (if any) and lets the student open
 * the global ManagerSelectModal (mounted in Shell.tsx) to pick or change one.
 *
 * Listens for `googenie:manager-changed` so the displayed name updates
 * immediately after the modal saves a new selection.
 */

import { useCallback, useEffect, useState } from "react";
import { authApi2 } from "../api/client";
import { Icon } from "./Icon";

interface Manager {
  id: string;
  displayName: string;
  email: string;
}

export function MyManagerCard() {
  const [loading, setLoading] = useState(true);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([authApi2.me(), authApi2.managers()])
      .then(([meRes, managersRes]) => {
        setCurrentId(meRes.user.managerUserId ?? null);
        setManagers(managersRes.managers);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load teacher info.");
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
    window.addEventListener("googenie:manager-changed", onChanged);
    return () => window.removeEventListener("googenie:manager-changed", onChanged);
  }, [refresh]);

  const currentManager = currentId ? managers.find((m) => m.id === currentId) : null;
  const buttonLabel = currentManager ? "Change Teacher" : "Pick my Teacher";

  return (
    <div className="mb-6 px-4 py-3 rounded-xl border bg-surface-container-low border-outline-variant/30 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-primary-container text-on-primary-container">
        <Icon name="school" className="text-base" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
          My Teacher
        </p>
        {loading ? (
          <p className="text-sm text-on-surface-variant">Loading…</p>
        ) : error ? (
          <p className="text-sm text-error">{error}</p>
        ) : currentManager ? (
          <p className="text-sm text-ink-text">
            <span className="font-medium">{currentManager.displayName}</span>
            <span className="text-on-surface-variant"> · {currentManager.email}</span>
          </p>
        ) : currentId ? (
          <p className="text-sm text-on-surface-variant">
            Assigned (id: {currentId}) — not in your current teacher list.
          </p>
        ) : (
          <p className="text-sm text-on-surface-variant">
            No teacher assigned yet. Pick a Teacher so they can manage your access.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(new CustomEvent("googenie:manager-select.open"))
        }
        className="btn-secondary text-xs px-3 py-1.5 flex-shrink-0"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
