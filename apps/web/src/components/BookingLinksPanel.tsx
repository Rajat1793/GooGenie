"use client";

/**
 * BookingLinksPanel — manage Calendly-style public booking links on the
 * Profile page. Lists existing links, lets the user create a fresh one,
 * toggle active/inactive, change duration, and copy the public URL.
 */
import { useEffect, useState } from "react";
import { meApi, type BookingLink } from "../api/client";
import { getErrorMessage } from "../lib/errors";
import { Icon } from "./Icon";

export function BookingLinksPanel() {
  const [links, setLinks] = useState<BookingLink[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function refresh() {
    try {
      const r = await meApi.listBookingLinks();
      setLinks(r.links);
    } catch (e) {
      setErr(getErrorMessage(e, "Failed to load booking links"));
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function handleCreate() {
    setBusy(true);
    setErr(null);
    try {
      await meApi.createBookingLink();
      await refresh();
    } catch (e) {
      setErr(getErrorMessage(e, "Failed to create booking link"));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(link: BookingLink) {
    try {
      await meApi.updateBookingLink(link.id, { is_active: !link.isActive });
      await refresh();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  }

  async function handleDuration(link: BookingLink, duration: number) {
    try {
      await meApi.updateBookingLink(link.id, { duration_minutes: duration });
      await refresh();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  }

  async function handleDelete(link: BookingLink) {
    if (!window.confirm(`Delete booking link "${link.title}"? This cannot be undone.`)) return;
    try {
      await meApi.deleteBookingLink(link.id);
      await refresh();
    } catch (e) {
      setErr(getErrorMessage(e));
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
    </div>
  );
}
