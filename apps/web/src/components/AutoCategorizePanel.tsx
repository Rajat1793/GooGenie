"use client";

/**
 * AutoCategorizePanel — Feature A4 control surface.
 *
 * Lets the user:
 *   - toggle "automatically label new mail as it arrives"
 *   - manually run a one-off sweep over recent unread inbox
 *
 * Server uses Mistral to classify each message into one of:
 * needs_reply | fyi | newsletter | calendar_invite | spam_like
 * and applies a "Googenie/<category>" Gmail label via Corsair.
 */
import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { getErrorMessage } from "../lib/errors";
import { Icon } from "./Icon";

interface RunResult {
  scanned: number;
  categorized: number;
  by_category: Record<string, number>;
  examples: Array<{ thread_id: string; subject: string; category: string }>;
}

const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  needs_reply:     { label: "Needs reply",   emoji: "✍️" },
  fyi:             { label: "FYI",           emoji: "ℹ️" },
  newsletter:      { label: "Newsletter",    emoji: "📰" },
  calendar_invite: { label: "Invite",        emoji: "📅" },
  spam_like:       { label: "Suspicious",    emoji: "⚠️" },
};

export function AutoCategorizePanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const r = await apiFetch<{ enabled: boolean; last_run: string | null }>("/v1/me/auto-categorize");
      setEnabled(r.enabled);
      setLastRun(r.last_run ?? null);
    } catch (e) {
      setErr(getErrorMessage(e, "Failed to load settings"));
    }
  }
  useEffect(() => { void load(); }, []);

  async function handleToggle() {
    if (enabled === null) return;
    setBusy(true); setErr(null);
    try {
      await apiFetch("/v1/me/auto-categorize/toggle", {
        method: "POST",
        body: JSON.stringify({ enabled: !enabled }),
      });
      setEnabled(!enabled);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally { setBusy(false); }
  }

  async function handleRun() {
    setRunning(true); setErr(null); setResult(null);
    try {
      const r = await apiFetch<RunResult>("/v1/me/auto-categorize/run", {
        method: "POST",
        body: JSON.stringify({ limit: 10 }),
      });
      setResult(r);
      await load();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally { setRunning(false); }
  }

  return (
    <div className="nimbus-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="auto_awesome" className="text-base" style={{ color: "var(--c-tertiary)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--c-on-surface)" }}>
            Auto-categorize new mail
          </h3>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs" style={{ color: "var(--c-on-surface-variant)" }}>
            {enabled === null ? "…" : enabled ? "On" : "Off"}
          </span>
          <input
            type="checkbox"
            disabled={busy || enabled === null}
            checked={!!enabled}
            onChange={handleToggle}
            className="w-4 h-4"
            style={{ accentColor: "var(--c-primary)" }}
          />
        </label>
      </div>
      <p className="text-[11px]" style={{ color: "var(--c-on-surface-variant)" }}>
        When on, every new mail Pub/Sub event triggers a quick AI classification and labels the
        thread <code>Googenie/Needs Reply</code>, <code>FYI</code>, <code>Newsletter</code>, etc.
      </p>
      {lastRun && (
        <p className="text-[11px]" style={{ color: "var(--c-on-surface-variant)" }}>
          Last sweep: {new Date(lastRun).toLocaleString()}
        </p>
      )}
      {err && (
        <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--c-error-container)", color: "var(--c-error)" }}>
          {err}
        </div>
      )}
      <button
        onClick={handleRun}
        disabled={running}
        className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1 disabled:opacity-50"
        style={{ background: "var(--c-secondary-container)", color: "var(--c-on-secondary-container)" }}
      >
        <Icon name={running ? "progress_activity" : "sync"} className="text-sm" />
        {running ? "Sorting…" : "Sort recent inbox now"}
      </button>
      {result && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--c-surface-container)" }}>
          <p className="text-xs font-medium" style={{ color: "var(--c-on-surface)" }}>
            Scanned {result.scanned} unread · labeled {result.categorized}
          </p>
          {result.categorized > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(result.by_category)
                .filter(([, n]) => n > 0)
                .map(([cat, n]) => (
                  <span
                    key={cat}
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ background: "var(--c-tertiary-container)", color: "var(--c-on-tertiary-container)" }}
                  >
                    {CATEGORY_META[cat]?.emoji ?? "•"} {CATEGORY_META[cat]?.label ?? cat} · {n}
                  </span>
                ))}
            </div>
          )}
          {result.examples.length > 0 && (
            <ul className="space-y-1 mt-1">
              {result.examples.map((ex, i) => (
                <li key={i} className="text-[11px] truncate" style={{ color: "var(--c-on-surface-variant)" }}>
                  <span className="font-semibold">{CATEGORY_META[ex.category]?.emoji ?? "•"}</span>{" "}
                  {ex.subject}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
