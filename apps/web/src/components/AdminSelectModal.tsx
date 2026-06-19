"use client";

/**
 * AdminSelectModal — first-login prompt for `manager_admin` users with no
 * `managerUserId` so they can pick which Big Boss they report to.
 *
 * Open triggers:
 *   - Auto: ClerkTokenWirer dispatches `googenie:admin-select.open` after
 *     /v1/auth/clerk-sync returns `needsManager: true` for a manager_admin.
 *   - Manual: any component can dispatch the same event (e.g. the picker on
 *     the Profile page reuses this modal).
 *
 * Skippable: closing via "Skip for now" sets a sessionStorage flag so we
 * don't nag again this session. The manager can still open it from the
 * Profile page → "My Admin" picker any time.
 */

import { useEffect, useState } from "react";
import { authApi2 } from "../api/client";
import { Icon } from "./Icon";

interface Boss {
  id: string;
  displayName: string;
  email: string;
}

const SKIP_FLAG = "googenie:admin-select.skipped";

export function AdminSelectModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bosses, setBosses] = useState<Boss[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for the open event.
  useEffect(() => {
    function onOpen() {
      setError(null);
      setOpen(true);
    }
    window.addEventListener("googenie:admin-select.open", onOpen);
    return () => window.removeEventListener("googenie:admin-select.open", onOpen);
  }, []);

  // Fetch bosses list whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    authApi2
      .bosses()
      .then((r) => {
        if (cancelled) return;
        setBosses(r.bosses);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load admins.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function handleSkip() {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SKIP_FLAG, "1");
    }
    setOpen(false);
  }

  async function handleConfirm() {
    if (!selectedId || saving) return;
    setSaving(true);
    setError(null);
    try {
      await authApi2.selectManager(selectedId);
      window.dispatchEvent(
        new CustomEvent("googenie:admin-changed", { detail: { managerUserId: selectedId } }),
      );
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign admin.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleSkip();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: "var(--c-surface-container-high)",
          border: "1px solid var(--c-outline-variant)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--c-outline-variant)" }}
        >
          <div className="flex items-center gap-2">
            <Icon name="shield_person" className="text-xl" style={{ color: "var(--c-primary)" }} />
            <h2
              className="font-semibold text-sm"
              style={{ color: "var(--c-on-surface)" }}
            >
              Pick your Admin
            </h2>
          </div>
          <button
            onClick={handleSkip}
            className="text-xs px-2 py-1 rounded hover:opacity-70"
            style={{ color: "var(--c-on-surface-variant)" }}
            title="Skip for now — you can pick later from Profile"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-xs mb-4" style={{ color: "var(--c-on-surface-variant)" }}>
            Choose the Big Boss you report to. This decides who can manage your
            feature access. You can change this any time from your Profile.
          </p>

          {loading && (
            <div
              className="text-xs py-6 text-center"
              style={{ color: "var(--c-on-surface-variant)" }}
            >
              Loading admins…
            </div>
          )}

          {!loading && bosses.length === 0 && !error && (
            <div
              className="text-xs py-6 text-center"
              style={{ color: "var(--c-on-surface-variant)" }}
            >
              No admins available yet. Ask your organisation owner to invite one.
            </div>
          )}

          {!loading && bosses.length > 0 && (
            <ul className="space-y-1.5 max-h-[40vh] overflow-y-auto">
              {bosses.map((b) => {
                const active = selectedId === b.id;
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(b.id)}
                      className="w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors"
                      style={{
                        background: active
                          ? "color-mix(in srgb, var(--c-primary) 12%, transparent)"
                          : "var(--c-surface-container)",
                        border: active
                          ? "1px solid var(--c-primary)"
                          : "1px solid var(--c-outline-variant)",
                      }}
                    >
                      <span
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                        style={{
                          background: "var(--c-primary-container)",
                          color: "var(--c-on-primary-container)",
                        }}
                      >
                        {b.displayName.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span
                          className="block text-sm font-medium truncate"
                          style={{ color: "var(--c-on-surface)" }}
                        >
                          {b.displayName}
                        </span>
                        <span
                          className="block text-[11px] truncate"
                          style={{ color: "var(--c-on-surface-variant)" }}
                        >
                          {b.email}
                        </span>
                      </span>
                      {active && (
                        <Icon
                          name="check_circle"
                          className="text-base"
                          style={{ color: "var(--c-primary)" }}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error && (
            <p className="mt-3 text-xs" style={{ color: "var(--c-error)" }}>
              {error}
            </p>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-3 border-t"
          style={{ borderColor: "var(--c-outline-variant)" }}
        >
          <button
            type="button"
            onClick={handleSkip}
            disabled={saving}
            className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-50"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedId || saving}
            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Returns true if the user previously skipped the modal this session. */
export function adminSelectSkippedThisSession(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(SKIP_FLAG) === "1";
}
