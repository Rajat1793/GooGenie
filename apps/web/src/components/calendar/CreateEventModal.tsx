"use client";

/**
 * Create-event modal with embedded "Find a Time" smart scheduler.
 * Extracted from CalendarPage. Self-contained: owns its state, calls
 * `calendarApi.createEvent`, then bubbles the new event back via `onCreated`.
 */
import { useState, useEffect } from "react";
import { calendarApi, aiApi, type CalendarEvent, type AiSlot } from "../../api/client";
import { useFeatures } from "../../contexts/FeatureContext";
import { getErrorMessage } from "../../lib/errors";
import { Icon } from "../../components/Icon";

interface CreateEventModalProps {
  onClose: () => void;
  onCreated: (e: CalendarEvent) => void;
}

export function CreateEventModal({ onClose, onCreated }: CreateEventModalProps) {
  const { hasFeature } = useFeatures();
  const canFindTime = hasFeature("ai_compose"); // gate "Find a Time" by ai_compose access
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [attendees, setAttendees] = useState("");
  const [withMeet, setWithMeet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ── Smart scheduler ─────────────────────────────────────────────────────────
  const [showFindTime, setShowFindTime] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [aiDuration, setAiDuration] = useState(30);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSlots, setAiSlots] = useState<AiSlot[] | null>(null);
  const [aiRationale, setAiRationale] = useState<string | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);

  // ── Live conflict detection ─────────────────────────────────────────────────
  // Whenever the user changes date/start/end, debounce-call /availability/check
  // and surface any existing events that overlap the picked window. Cheap UX
  // win — saves a round-trip-from-Google scheduling mistake.
  const [conflicts, setConflicts] = useState<Array<{ start: string; end: string }>>([]);
  const [conflictBusy, setConflictBusy] = useState(false);

  // ── Feature C3 — AI conflict resolver ────────────────────────────────────
  const [aiResolution, setAiResolution] = useState<import("../../api/client").ConflictResolutionResponse | null>(null);
  const [aiResolveBusy, setAiResolveBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!date || !startTime || !endTime) { setConflicts([]); return; }
    const handle = setTimeout(async () => {
      try {
        const startsAt = new Date(`${date}T${startTime}`).toISOString();
        const endsAt = new Date(`${date}T${endTime}`).toISOString();
        if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
          if (!cancelled) setConflicts([]);
          return;
        }
        setConflictBusy(true);
        const r = await calendarApi.checkAvailability({ time_min: startsAt, time_max: endsAt });
        if (cancelled) return;
        const all = r.availability.flatMap((c) => c.busy);
        const overlapping = all.filter((b) => {
          const bs = new Date(b.start).getTime();
          const be = new Date(b.end).getTime();
          const rs = new Date(startsAt).getTime();
          const re = new Date(endsAt).getTime();
          return bs < re && be > rs;
        });
        setConflicts(overlapping);
        // Reset AI resolution whenever conflicts change.
        setAiResolution(null);
      } catch {
        if (!cancelled) setConflicts([]);
      } finally {
        if (!cancelled) setConflictBusy(false);
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [date, startTime, endTime]);

  // Feature C3 — fetch AI resolution suggestion on demand.
  async function fetchAiResolution() {
    if (!date || !startTime || !endTime || !title.trim()) return;
    setAiResolveBusy(true);
    try {
      const startsAt = new Date(`${date}T${startTime}`).toISOString();
      const endsAt = new Date(`${date}T${endTime}`).toISOString();
      const attendeeList = attendees
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      const r = await aiApi.checkConflicts({
        starts_at: startsAt,
        ends_at: endsAt,
        title,
        attendees: attendeeList,
      });
      setAiResolution(r);
    } catch (e) {
      console.error("AI conflict resolver error:", e);
    } finally {
      setAiResolveBusy(false);
    }
  }

  async function findTime() {
    if (!aiDescription.trim()) { setAiErr("Describe the meeting first"); return; }
    setAiBusy(true);
    setAiErr(null);
    try {
      const r = await aiApi.suggestSlots({
        description: aiDescription.trim(),
        duration_minutes: aiDuration,
      });
      setAiSlots(r.slots);
      setAiRationale(r.rationale);
      if (r.slots.length === 0) setAiErr("No available slots in your business hours this week.");
    } catch (e) {
      setAiErr(getErrorMessage(e));
    } finally {
      setAiBusy(false);
    }
  }

  function applySlot(slot: AiSlot) {
    const s = new Date(slot.start);
    const e = new Date(slot.end);
    setDate(s.toISOString().slice(0, 10));
    setStartTime(s.toTimeString().slice(0, 5));
    setEndTime(e.toTimeString().slice(0, 5));
    setShowFindTime(false);
  }

  async function handleCreate() {
    if (!title.trim()) { setErr("Title is required"); return; }
    setErr(null); setSaving(true);
    try {
      const starts_at = new Date(`${date}T${startTime}`).toISOString();
      const ends_at   = new Date(`${date}T${endTime}`).toISOString();
      const res = await calendarApi.createEvent({
        title,
        starts_at,
        ends_at,
        attendees: attendees.split(",").map(s => s.trim()).filter(Boolean),
        with_meet: withMeet,
      });
      onCreated(res.event); onClose();
    } catch (e) { setErr(getErrorMessage(e, "Failed to create")); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--c-surface-container-low)", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-headline text-xl" style={{ color: "var(--c-on-surface)" }}>New Event</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><Icon name="close" className="text-xl" /></button>
        </div>
        {err && <div className="rounded-xl px-4 py-2 mb-4 text-sm" style={{ background: "var(--c-error-container)", color: "var(--c-error)" }}>{err}</div>}

        {/* Smart scheduler — AI Find a Time */}
        {canFindTime && (
          <div className="mb-4">
            {!showFindTime && (
              <button
                onClick={() => setShowFindTime(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition"
                style={{
                  background: "color-mix(in srgb, var(--c-tertiary) 12%, transparent)",
                  color: "var(--c-tertiary)",
                  border: "1px dashed color-mix(in srgb, var(--c-tertiary) 35%, transparent)",
                }}
              >
                <Icon name="auto_awesome" className="text-base" />
                ✨ Find a Time with AI
              </button>
            )}
            {showFindTime && (
              <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--c-surface-container-high)", border: "1px solid var(--c-outline-variant)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--c-tertiary)" }}>✨ Smart Scheduler</span>
                  <button onClick={() => setShowFindTime(false)} className="text-xs" style={{ color: "var(--c-on-surface-variant)" }}>Hide</button>
                </div>
                <input
                  value={aiDescription}
                  onChange={(e) => setAiDescription(e.target.value)}
                  placeholder="e.g. 30min sync with Priya about Q3 plan"
                  className="input-field text-sm"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={aiDuration}
                    onChange={(e) => setAiDuration(Number(e.target.value))}
                    className="input-field text-xs flex-1"
                  >
                    {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
                  </select>
                  <button
                    onClick={() => void findTime()}
                    disabled={aiBusy || !aiDescription.trim()}
                    className="btn-primary py-2 px-3 text-xs disabled:opacity-40 flex items-center gap-1"
                  >
                    {aiBusy ? <Icon name="progress_activity" className="animate-spin text-sm" /> : <Icon name="search" className="text-sm" />}
                    Find
                  </button>
                </div>
                {aiErr && <p className="text-[11px]" style={{ color: "var(--c-error)" }}>{aiErr}</p>}
                {aiRationale && (
                  <p className="text-[11px] italic" style={{ color: "var(--c-on-surface-variant)" }}>
                    {aiRationale}
                  </p>
                )}
                {aiSlots && aiSlots.length > 0 && (
                  <div className="space-y-1">
                    {aiSlots.map((s) => {
                      const start = new Date(s.start);
                      const end = new Date(s.end);
                      return (
                        <button
                          key={s.start}
                          onClick={() => applySlot(s)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition hover:opacity-80"
                          style={{ background: "var(--c-surface-container)", border: "1px solid var(--c-outline-variant)" }}
                        >
                          <span style={{ color: "var(--c-on-surface)" }}>
                            {start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                            {" · "}
                            {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            {" → "}
                            {end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </span>
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                            style={{ background: "var(--c-tertiary-container)", color: "var(--c-on-tertiary-container)" }}
                          >
                            {s.reason}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="space-y-4">
          {[{ label: "Title", type: "text", value: title, set: setTitle, placeholder: "Event title" }, { label: "Date", type: "date", value: date, set: setDate, placeholder: "" }].map(f => (
            <div key={f.label}>
              <label className="section-label mb-1.5 block">{f.label}</label>
              <input type={f.type} value={f.value} onChange={(e) => f.set(e.target.value)} placeholder={f.placeholder} className="input-field" />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            {[{ label: "Start", value: startTime, set: setStartTime }, { label: "End", value: endTime, set: setEndTime }].map(f => (
              <div key={f.label}>
                <label className="section-label mb-1.5 block">{f.label}</label>
                <input type="time" value={f.value} onChange={(e) => f.set(e.target.value)} className="input-field" />
              </div>
            ))}
          </div>
          {/* Live conflict badge */}
          {conflicts.length > 0 && (
            <div
              className="rounded-xl px-3 py-2 flex items-start gap-2 text-xs"
              style={{
                background: "color-mix(in srgb, var(--c-error) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--c-error) 30%, transparent)",
                color: "var(--c-error)",
              }}
            >
              <Icon name="warning" className="text-base shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold mb-0.5">
                  {conflicts.length === 1
                    ? "⚠ Time conflicts with 1 existing event"
                    : `⚠ Time conflicts with ${conflicts.length} existing events`}
                </p>
                <ul className="space-y-0.5 opacity-90">
                  {conflicts.slice(0, 3).map((c, i) => (
                    <li key={i}>
                      {new Date(c.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      {" – "}
                      {new Date(c.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </li>
                  ))}
                </ul>
                {canFindTime && (
                  <button
                    onClick={() => {
                      setAiDescription(title || "this meeting");
                      setShowFindTime(true);
                    }}
                    className="mt-1.5 underline text-[11px] font-medium"
                    style={{ color: "var(--c-error)" }}
                  >
                    Suggest a free slot →
                  </button>
                )}
                {/* Feature C3 — Ask AI to resolve the conflict. */}
                <button
                  onClick={() => void fetchAiResolution()}
                  disabled={aiResolveBusy || !title.trim()}
                  className="mt-1.5 ml-3 underline text-[11px] font-medium disabled:opacity-50"
                  style={{ color: "var(--c-error)" }}
                  title={!title.trim() ? "Enter a title first" : "Ask AI which event to keep"}
                >
                  {aiResolveBusy ? "Asking AI…" : "✨ Resolve with AI"}
                </button>
              </div>
            </div>
          )}
          {/* Feature C3 — AI conflict resolution suggestion panel. */}
          {aiResolution?.hasConflicts && (
            <div
              className="rounded-xl px-3 py-2.5 flex flex-col gap-2 text-xs"
              style={{
                background: "color-mix(in srgb, var(--c-tertiary) 8%, transparent)",
                border: "1px solid color-mix(in srgb, var(--c-tertiary) 25%, transparent)",
              }}
            >
              <div className="flex items-start gap-2">
                <Icon name="auto_awesome" className="text-base shrink-0 mt-0.5" style={{ color: "var(--c-tertiary)" }} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold mb-1" style={{ color: "var(--c-tertiary)" }}>
                    AI Suggestion
                  </p>
                  {aiResolution.summary && (
                    <p className="mb-1.5" style={{ color: "var(--c-on-surface)" }}>
                      {aiResolution.summary}
                    </p>
                  )}
                  {aiResolution.newEventYields ? (
                    <p style={{ color: "var(--c-on-surface-variant)" }}>
                      Recommendation: <strong>keep the existing event</strong> and pick a different time for &ldquo;{title}&rdquo;.
                    </p>
                  ) : aiResolution.suggestedToMove ? (
                    <p style={{ color: "var(--c-on-surface-variant)" }}>
                      Recommendation: <strong>move the existing event</strong>{" "}
                      ({aiResolution.conflicts.find((c) => c.id === aiResolution.suggestedToMove?.eventId)?.title ?? "conflict"}){" "}
                      and keep your new one.
                    </p>
                  ) : null}
                  {aiResolution.draftReply && (
                    <div
                      className="mt-2 italic px-2 py-1.5 rounded text-[11px]"
                      style={{
                        background: "var(--c-surface-container-lowest)",
                        color: "var(--c-on-surface-variant)",
                      }}
                    >
                      <span className="font-semibold uppercase tracking-wide block mb-0.5 not-italic">
                        DRAFT REPLY TO ATTENDEES
                      </span>
                      {aiResolution.draftReply}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {!conflictBusy && conflicts.length === 0 && date && startTime && endTime && (
            <div
              className="rounded-xl px-3 py-2 flex items-center gap-2 text-xs"
              style={{
                background: "color-mix(in srgb, var(--c-primary) 7%, transparent)",
                border: "1px solid color-mix(in srgb, var(--c-primary) 20%, transparent)",
                color: "var(--c-primary)",
              }}
            >
              <Icon name="check_circle" className="text-base" />
              You&rsquo;re free at that time.
            </div>
          )}
          <div>
            <label className="section-label mb-1.5 block">Attendees <span className="normal-case tracking-normal font-normal" style={{ color: "var(--c-outline)" }}>(comma-separated)</span></label>
            <input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="alice@example.com, bob@example.com" className="input-field" />
          </div>
          <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all" style={{ background: withMeet ? "color-mix(in srgb, var(--c-primary) 8%, transparent)" : "var(--c-surface-container)", border: `1px solid ${withMeet ? "color-mix(in srgb, var(--c-primary) 25%, transparent)" : "var(--c-outline-variant)"}` }}>
            <input type="checkbox" checked={withMeet} onChange={(e) => setWithMeet(e.target.checked)} className="w-4 h-4 accent-current" style={{ accentColor: "var(--c-primary)" }} />
            <Icon name="videocam" className="text-[18px]" style={{ color: withMeet ? "var(--c-primary)" : "var(--c-on-surface-variant)" }} />
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: withMeet ? "var(--c-primary)" : "var(--c-on-surface)" }}>Add Google Meet</p>
              <p className="text-[10px]" style={{ color: "var(--c-on-surface-variant)" }}>Auto-generate a video link and share with attendees</p>
            </div>
          </label>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleCreate} disabled={saving || !title.trim()} className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Icon name="progress_activity" className="animate-spin text-base" /> : <Icon name="add" className="text-base" />}
            {saving ? "Creating…" : "Create Event"}
          </button>
        </div>
      </div>
    </div>
  );
}
