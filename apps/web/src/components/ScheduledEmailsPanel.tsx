/**
 * ScheduledEmailsPanel
 *
 * Profile-page widget that lists emails queued for later send (kind="scheduled")
 * and lets the user cancel any before they fire. Powered by:
 *   GET    /api/v1/email/messages/scheduled
 *   DELETE /api/v1/email/messages/scheduled/:id
 */
"use client";
import { useEffect, useState } from "react";
import { emailApi, type ScheduledEmail } from "../api/client";
import { Icon } from "./Icon";

export function ScheduledEmailsPanel() {
  const [rows, setRows] = useState<ScheduledEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await emailApi.listScheduled();
      // Only show real "Send later" emails, not the 10-sec undo queue.
      setRows(r.scheduled.filter((s) => s.kind === "scheduled"));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Refresh every 30s in case the poller flushed some.
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, []);

  async function handleCancel(id: number) {
    setCancelling(id);
    try {
      await emailApi.cancelScheduled(id);
      setRows((cur) => cur.filter((r) => r.id !== id));
    } catch (e) {
      console.error("Cancel scheduled email failed:", e);
    } finally {
      setCancelling(null);
    }
  }

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "var(--c-surface-container-low)",
        border: "1px solid var(--c-outline-variant)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon name="schedule_send" className="text-base" style={{ color: "var(--c-primary)" }} />
          <h3 className="font-semibold text-sm" style={{ color: "var(--c-on-surface)" }}>
            Scheduled Sends
          </h3>
          {rows.length > 0 && (
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
              style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}
            >
              {rows.length}
            </span>
          )}
        </div>
        <button onClick={() => void load()} className="btn-ghost text-xs" title="Refresh">
          <Icon name="refresh" className="text-sm" />
        </button>
      </div>

      {loading && <p className="text-xs text-on-surface-variant">Loading…</p>}

      {!loading && rows.length === 0 && (
        <p className="text-xs text-on-surface-variant py-3">
          No emails queued. Use &ldquo;Send later&rdquo; in Compose to schedule one.
        </p>
      )}

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r) => {
            const when = new Date(r.sendAt);
            const fromNow = Math.round((when.getTime() - Date.now()) / 60000);
            const labelFromNow =
              fromNow < 60
                ? `in ${fromNow} min`
                : fromNow < 60 * 24
                ? `in ${Math.round(fromNow / 60)} h`
                : `in ${Math.round(fromNow / (60 * 24))} d`;
            return (
              <div
                key={r.id}
                className="rounded-xl px-3 py-2.5 flex items-center gap-3"
                style={{
                  background: "var(--c-surface-container)",
                  border: "1px solid var(--c-outline-variant)",
                }}
              >
                <Icon name="mail" className="text-base text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--c-on-surface)" }}>
                    {r.subject}
                  </p>
                  <p className="text-xs truncate" style={{ color: "var(--c-on-surface-variant)" }}>
                    To {r.to} · {when.toLocaleString()} ({labelFromNow})
                  </p>
                </div>
                <button
                  onClick={() => void handleCancel(r.id)}
                  disabled={cancelling === r.id}
                  className="btn-ghost text-xs px-2 disabled:opacity-50"
                  style={{ color: "var(--c-error)" }}
                >
                  {cancelling === r.id ? "Cancelling…" : "Cancel"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
