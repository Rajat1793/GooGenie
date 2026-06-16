"use client";

/**
 * Free/busy availability check modal. Extracted from CalendarPage.
 */
import { useState } from "react";
import { calendarApi } from "../../api/client";
import { getErrorMessage } from "../../lib/errors";
import { Icon } from "../../components/Icon";

interface AvailabilityModalProps {
  onClose: () => void;
}

export function AvailabilityModal({ onClose }: AvailabilityModalProps) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Array<{ calendarId: string; busy: Array<{ start: string; end: string }> }> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleCheck() {
    setChecking(true); setErr(null); setResult(null);
    try {
      const time_min = new Date(`${date}T${startTime}`).toISOString();
      const time_max = new Date(`${date}T${endTime}`).toISOString();
      const res = await calendarApi.checkAvailability({ time_min, time_max });
      setResult(res.availability);
    } catch (e) { setErr(getErrorMessage(e, "Failed to check")); }
    finally { setChecking(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--c-surface-container-low)", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-headline text-xl" style={{ color: "var(--c-on-surface)" }}>Check Availability</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><Icon name="close" className="text-xl" /></button>
        </div>
        {err && <div className="rounded-xl px-4 py-2 mb-4 text-sm" style={{ background: "var(--c-error-container)", color: "var(--c-error)" }}>{err}</div>}
        <div className="space-y-3">
          <div><label className="section-label mb-1 block">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="section-label mb-1 block">From</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input-field" /></div>
            <div><label className="section-label mb-1 block">To</label><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input-field" /></div>
          </div>
          {result !== null && (
            <div className="nimbus-card p-4 space-y-2 mt-2">
              {result.length === 0
                ? <p className="text-sm font-semibold" style={{ color: "var(--c-primary)" }}>✓ You're free during this window</p>
                : result.map((cal) => (
                  <div key={cal.calendarId}>
                    <p className="text-xs font-semibold mb-1" style={{ color: "var(--c-on-surface-variant)" }}>{cal.calendarId}</p>
                    {cal.busy.length === 0 ? <p className="text-xs" style={{ color: "var(--c-primary)" }}>Free</p>
                      : cal.busy.map((b, i) => <p key={i} className="text-xs" style={{ color: "var(--c-error)" }}>Busy: {new Date(b.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {new Date(b.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>)
                    }
                  </div>
                ))
              }
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Close</button>
          <button onClick={handleCheck} disabled={checking} className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center gap-2">
            {checking ? <Icon name="progress_activity" className="animate-spin text-base" /> : <Icon name="event_available" className="text-base" />}
            {checking ? "Checking…" : "Check"}
          </button>
        </div>
      </div>
    </div>
  );
}
