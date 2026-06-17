"use client";

/**
 * UnsubscribeSweepModal — Feature C2.
 *
 * Lists senders with a List-Unsubscribe header, ranked by unread-rate so
 * the noisiest ones appear first. User multi-selects, clicks "Unsubscribe",
 * server hits each URL (One-Click POST or GET) and labels the latest thread
 * with `Googenie/Unsubscribed` so the user can find them later.
 */
import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { getErrorMessage } from "../lib/errors";
import { Icon } from "./Icon";

interface Sender {
  email: string;
  displayName: string;
  totalMessages: number;
  unreadMessages: number;
  latestMessageId: string;
  latestThreadId: string;
  latestDate: string;
  unsubscribeUrls: string[];
  oneClick: boolean;
}

interface Result {
  email: string;
  ok: boolean;
  status?: number;
  usedUrl?: string;
  error?: string;
}

export function UnsubscribeSweepModal({ onClose }: { onClose: () => void }) {
  const [senders, setSenders] = useState<Sender[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch<{ senders: Sender[] }>("/v1/email/newsletters?limit=40");
        if (!cancelled) setSenders(r.senders);
      } catch (e) {
        if (!cancelled) setErr(getErrorMessage(e, "Failed to scan inbox"));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Default-select senders with high unread rate to nudge the user.
  useEffect(() => {
    if (!senders) return;
    const seed = new Set<string>();
    for (const s of senders) {
      const rate = s.unreadMessages / Math.max(1, s.totalMessages);
      if (rate >= 0.8 && s.totalMessages >= 2) seed.add(s.email);
    }
    setSelected(seed);
  }, [senders]);

  function toggle(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  async function handleUnsubscribe() {
    if (!senders || selected.size === 0) return;
    setBusy(true); setErr(null); setResults(null);
    try {
      const payload = {
        senders: senders
          .filter((s) => selected.has(s.email))
          .map((s) => ({
            email: s.email,
            urls: s.unsubscribeUrls,
            oneClick: s.oneClick,
            latestThreadId: s.latestThreadId || undefined,
          })),
      };
      const r = await apiFetch<{ results: Result[] }>("/v1/email/newsletters/unsubscribe", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setResults(r.results);
      // Drop successfully-unsubscribed senders from the list.
      const okSet = new Set(r.results.filter((x) => x.ok).map((x) => x.email));
      setSenders((cur) => (cur ? cur.filter((s) => !okSet.has(s.email)) : cur));
      setSelected(new Set());
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[290] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ background: "var(--c-surface-container-high)", border: "1px solid var(--c-outline-variant)" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--c-outline-variant)" }}>
          <div className="flex items-center gap-2">
            <Icon name="cleaning_services" className="text-base" style={{ color: "var(--c-tertiary)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--c-on-surface)" }}>
              Smart unsubscribe sweep
            </h2>
            {senders && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "var(--c-tertiary-container)", color: "var(--c-on-tertiary-container)" }}>
                {senders.length}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-xs px-2 py-1 rounded hover:opacity-70" style={{ color: "var(--c-on-surface-variant)" }}>
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {senders === null && !err && (
            <div className="text-xs italic text-center py-6" style={{ color: "var(--c-on-surface-variant)" }}>
              Scanning your inbox for newsletter senders…
            </div>
          )}
          {err && (
            <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--c-error-container)", color: "var(--c-error)" }}>
              {err}
            </div>
          )}
          {senders && senders.length === 0 && (
            <div className="text-xs italic text-center py-6" style={{ color: "var(--c-on-surface-variant)" }}>
              🎉 No noisy newsletter subscriptions found in your recent inbox.
            </div>
          )}
          {senders?.map((s) => {
            const rate = s.unreadMessages / Math.max(1, s.totalMessages);
            const isSelected = selected.has(s.email);
            const result = results?.find((r) => r.email === s.email);
            return (
              <label
                key={s.email}
                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition"
                style={{
                  background: isSelected ? "var(--c-secondary-container)" : "var(--c-surface-container)",
                  opacity: result?.ok ? 0.5 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(s.email)}
                  disabled={busy}
                  className="w-4 h-4"
                  style={{ accentColor: "var(--c-primary)" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate" style={{ color: "var(--c-on-surface)" }}>
                      {s.displayName}
                    </span>
                    {s.oneClick && (
                      <span className="text-[9px] px-1 rounded font-bold" style={{ background: "var(--c-tertiary-container)", color: "var(--c-on-tertiary-container)" }}>
                        1-CLICK
                      </span>
                    )}
                    {result?.ok && (
                      <span className="text-[10px] font-semibold" style={{ color: "var(--c-tertiary)" }}>
                        ✓ unsubscribed
                      </span>
                    )}
                    {result && !result.ok && (
                      <span className="text-[10px] font-semibold" style={{ color: "var(--c-error)" }}>
                        ✗ {result.error ?? "failed"}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--c-on-surface-variant)" }}>
                    {s.email} · {s.totalMessages} message{s.totalMessages === 1 ? "" : "s"}
                    {s.unreadMessages > 0 && ` · ${s.unreadMessages} unread (${Math.round(rate * 100)}%)`}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: "var(--c-outline-variant)" }}>
          <span className="text-xs" style={{ color: "var(--c-on-surface-variant)" }}>
            {selected.size} selected
          </span>
          <button
            onClick={handleUnsubscribe}
            disabled={busy || selected.size === 0}
            className="px-4 py-1.5 rounded-full text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
            style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}
          >
            <Icon name={busy ? "progress_activity" : "close"} className="text-sm" />
            {busy ? "Unsubscribing…" : `Unsubscribe ${selected.size}`}
          </button>
        </div>
      </div>
    </div>
  );
}
