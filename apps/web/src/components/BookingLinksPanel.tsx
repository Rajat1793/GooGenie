"use client";

/**
 * BookingLinksPanel — manage Calendly-style public booking links on the
 * Profile page. Lists existing links, lets the user create a fresh one,
 * toggle active/inactive, change duration, and copy the public URL.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { meApi, type BookingLink } from "../api/client";
import { useBookingLinks } from "../api/hooks";
import { qk } from "../api/queryClient";
import { getErrorMessage } from "../lib/errors";
import { Icon } from "./Icon";

export function BookingLinksPanel() {
  const qc = useQueryClient();
  // Read from the React Query cache — the DemoTour prefetches this key so
  // first navigation is instant. `data?.links` may be undefined while the
  // request is in flight; we render a skeleton in that case.
  const { data, error: queryError, refetch } = useBookingLinks();
  const links = data?.links ?? null;
  const [localErr, setLocalErr] = useState<string | null>(null);
  const err = localErr ?? (queryError ? getErrorMessage(queryError, "Failed to load booking links") : null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  // Pending delete — holds the booking link the user clicked "Delete" on so
  // the confirm modal can show its title. `null` = modal closed.
  const [confirmDelete, setConfirmDelete] = useState<BookingLink | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Invalidate the cache to trigger a refetch after mutations.
  async function refresh() {
    setLocalErr(null);
    await qc.invalidateQueries({ queryKey: qk.bookingLinks() });
    await refetch();
  }

  async function handleCreate() {
    setBusy(true);
    setLocalErr(null);
    try {
      await meApi.createBookingLink();
      await refresh();
    } catch (e) {
      setLocalErr(getErrorMessage(e, "Failed to create booking link"));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(link: BookingLink) {
    try {
      await meApi.updateBookingLink(link.id, { is_active: !link.isActive });
      await refresh();
    } catch (e) {
      setLocalErr(getErrorMessage(e));
    }
  }

  async function handleDuration(link: BookingLink, duration: number) {
    try {
      await meApi.updateBookingLink(link.id, { duration_minutes: duration });
      await refresh();
    } catch (e) {
      setLocalErr(getErrorMessage(e));
    }
  }

  async function handleDelete(link: BookingLink) {
    // Open the themed confirm modal instead of using the native window.confirm
    // (which doesn't match the rest of the app and got reported as jarring).
    setConfirmDelete(link);
  }

  async function confirmDeleteNow() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await meApi.deleteBookingLink(confirmDelete.id);
      setConfirmDelete(null);
      await refresh();
    } catch (e) {
      setLocalErr(getErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  function publicUrl(slug: string): string {
    if (typeof window === "undefined") return `/book/${slug}`;
    return `${window.location.origin}/book/${slug}`;
  }

  async function handleCopy(slug: string) {
    try {
      await navigator.clipboard.writeText(publicUrl(slug));
      setCopied(slug);
      setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1500);
    } catch {
      /* clipboard blocked — noop */
    }
  }

  return (
    <div className="nimbus-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="link" className="text-base" style={{ color: "var(--c-primary)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--c-on-surface)" }}>
            Booking Links
          </h3>
        </div>
        <button
          onClick={handleCreate}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1 disabled:opacity-50"
          style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}
        >
          <Icon name="add" className="text-sm" />
          New link
        </button>
      </div>
      <p className="text-[11px]" style={{ color: "var(--c-on-surface-variant)" }}>
        Share a public link — visitors pick a slot from your free time, and it&rsquo;s instantly added to your calendar.
      </p>
      {err && (
        <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--c-error-container)", color: "var(--c-error)" }}>
          {err}
        </div>
      )}
      {links === null ? (
        <div className="text-xs" style={{ color: "var(--c-on-surface-variant)" }}>Loading…</div>
      ) : links.length === 0 ? (
        <div className="text-xs text-center py-4" style={{ color: "var(--c-on-surface-variant)" }}>
          No booking links yet. Click <strong>New link</strong> to create one.
        </div>
      ) : (
        <ul className="space-y-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="rounded-xl p-3 flex flex-col gap-2"
              style={{
                background: "var(--c-surface-container)",
                border: "1px solid var(--c-outline-variant)",
                opacity: link.isActive ? 1 : 0.6,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold flex-1 truncate" style={{ color: "var(--c-on-surface)" }}>
                  {link.title}
                </span>
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide"
                  style={{
                    background: link.isActive ? "var(--c-tertiary-container)" : "var(--c-surface-container-high)",
                    color: link.isActive ? "var(--c-on-tertiary-container)" : "var(--c-on-surface-variant)",
                  }}
                >
                  {link.isActive ? "Active" : "Paused"}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px]" style={{ color: "var(--c-on-surface-variant)" }}>
                <code
                  className="flex-1 truncate px-2 py-1 rounded font-mono"
                  style={{ background: "var(--c-surface-container-lowest)", color: "var(--c-on-surface)" }}
                >
                  {publicUrl(link.slug)}
                </code>
                <button
                  onClick={() => handleCopy(link.slug)}
                  className="px-2 py-1 rounded hover:opacity-80"
                  style={{ color: copied === link.slug ? "var(--c-primary)" : "var(--c-on-surface-variant)" }}
                  title="Copy URL"
                >
                  {copied === link.slug ? "Copied!" : <Icon name="check" className="text-sm" />}
                </button>
                <a
                  href={publicUrl(link.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-1 rounded hover:opacity-80"
                  style={{ color: "var(--c-on-surface-variant)" }}
                  title="Open"
                >
                  <Icon name="open_in_new" className="text-sm" />
                </a>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px]" style={{ color: "var(--c-on-surface-variant)" }}>Duration:</span>
                {[15, 30, 45, 60].map((m) => (
                  <button
                    key={m}
                    onClick={() => handleDuration(link, m)}
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold border transition"
                    style={
                      link.durationMinutes === m
                        ? { background: "var(--c-primary)", color: "var(--c-on-primary)", borderColor: "var(--c-primary)" }
                        : { background: "transparent", color: "var(--c-on-surface-variant)", borderColor: "var(--c-outline-variant)" }
                    }
                  >
                    {m}m
                  </button>
                ))}
                <span className="text-[10px] ml-2" style={{ color: "var(--c-on-surface-variant)" }}>
                  {link.daysAhead} days ahead · {link.businessHours.start}:00 – {link.businessHours.end}:00
                </span>
                <div className="flex-1" />
                <button
                  onClick={() => handleToggle(link)}
                  className="text-[10px] px-2 py-0.5 rounded-full underline"
                  style={{ color: "var(--c-on-surface-variant)" }}
                >
                  {link.isActive ? "Pause" : "Activate"}
                </button>
                <button
                  onClick={() => handleDelete(link)}
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ color: "var(--c-error)" }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Themed delete-confirmation modal — replaces the native window.confirm
          so it matches the rest of the app (glass surface, primary buttons,
          inline busy state). */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setConfirmDelete(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{
              background: "var(--c-surface-container-low)",
              border: "1px solid var(--glass-border)",
              boxShadow: "var(--glass-shadow)",
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-delete-title"
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "var(--c-error-container)" }}
              >
                <Icon name="delete" className="text-xl" style={{ color: "var(--c-error)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="booking-delete-title"
                  className="font-headline text-lg leading-tight"
                  style={{ color: "var(--c-on-surface)" }}
                >
                  Delete booking link?
                </h2>
                <p className="text-sm mt-1" style={{ color: "var(--c-on-surface-variant)" }}>
                  <span className="font-semibold" style={{ color: "var(--c-on-surface)" }}>
                    “{confirmDelete.title}”
                  </span>{" "}
                  will be permanently removed. Anyone with the link will see a “not found” page.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="btn-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmDeleteNow()}
                disabled={deleting}
                className="px-4 py-2 rounded-full text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
                style={{ background: "var(--c-error)", color: "var(--c-on-error)" }}
              >
                {deleting ? (
                  <Icon name="progress_activity" className="animate-spin text-base" />
                ) : (
                  <Icon name="delete" className="text-base" />
                )}
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
