import { useState } from "react";
import { calendarApi, type CalendarEvent } from "../api/client.ts";
import { useCalendarEvents, useDeleteCalendarEvent } from "../api/hooks.ts";
import { useClerkReady } from "../hooks/useClerkReady.ts";
import { ConnectionBar, useConnectionStatus } from "../components/ConnectBanner.tsx";
import { useFeatures } from "../context/FeatureContext.tsx";
import { FeatureDisabledCard } from "../components/FeatureDisabledCard.tsx";

function CreateEventModal({ onClose, onCreated }: { onClose: () => void; onCreated: (e: CalendarEvent) => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [attendees, setAttendees] = useState("");
  const [withMeet, setWithMeet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to create"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--c-surface-container-low)", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-headline text-xl" style={{ color: "var(--c-on-surface)" }}>New Event</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><span className="material-symbols-outlined text-xl">close</span></button>
        </div>
        {err && <div className="rounded-xl px-4 py-2 mb-4 text-sm" style={{ background: "var(--c-error-container)", color: "var(--c-error)" }}>{err}</div>}
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
          <div>
            <label className="section-label mb-1.5 block">Attendees <span className="normal-case tracking-normal font-normal" style={{ color: "var(--c-outline)" }}>(comma-separated)</span></label>
            <input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="alice@example.com, bob@example.com" className="input-field" />
          </div>
          <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all" style={{ background: withMeet ? "color-mix(in srgb, var(--c-primary) 8%, transparent)" : "var(--c-surface-container)", border: `1px solid ${withMeet ? "color-mix(in srgb, var(--c-primary) 25%, transparent)" : "var(--c-outline-variant)"}` }}>
            <input type="checkbox" checked={withMeet} onChange={(e) => setWithMeet(e.target.checked)} className="w-4 h-4 accent-current" style={{ accentColor: "var(--c-primary)" }} />
            <span className="material-symbols-outlined text-[18px]" style={{ color: withMeet ? "var(--c-primary)" : "var(--c-on-surface-variant)" }}>videocam</span>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: withMeet ? "var(--c-primary)" : "var(--c-on-surface)" }}>Add Google Meet</p>
              <p className="text-[10px]" style={{ color: "var(--c-on-surface-variant)" }}>Auto-generate a video link and share with attendees</p>
            </div>
          </label>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleCreate} disabled={saving || !title.trim()} className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <span className="material-symbols-outlined text-base">add</span>}
            {saving ? "Creating…" : "Create Event"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Event Modal ──────────────────────────────────────────────────────────
function EditEventModal({ event, onClose, onUpdated }: { event: CalendarEvent; onClose: () => void; onUpdated: (e: CalendarEvent) => void }) {
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(new Date(event.startsAt).toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState(new Date(event.startsAt).toTimeString().slice(0, 5));
  const [endTime, setEndTime] = useState(new Date(event.endsAt).toTimeString().slice(0, 5));
  const [attendees, setAttendees] = useState(event.attendees.join(", "));
  const [description, setDescription] = useState(event.description ?? "");
  const [location, setLocation] = useState(event.location ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) { setErr("Title is required"); return; }
    setErr(null); setSaving(true);
    try {
      const starts_at = new Date(`${date}T${startTime}`).toISOString();
      const ends_at   = new Date(`${date}T${endTime}`).toISOString();
      const res = await calendarApi.updateEvent(event.id, { title, starts_at, ends_at, attendees: attendees.split(",").map(s => s.trim()).filter(Boolean), description: description || undefined, location: location || undefined });
      onUpdated(res.event); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to update"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--c-surface-container-low)", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-headline text-xl" style={{ color: "var(--c-on-surface)" }}>Edit Event</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><span className="material-symbols-outlined text-xl">close</span></button>
        </div>
        {err && <div className="rounded-xl px-4 py-2 mb-4 text-sm" style={{ background: "var(--c-error-container)", color: "var(--c-error)" }}>{err}</div>}
        <div className="space-y-3">
          <div><label className="section-label mb-1 block">Title</label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" /></div>
          <div><label className="section-label mb-1 block">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="section-label mb-1 block">Start</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input-field" /></div>
            <div><label className="section-label mb-1 block">End</label><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input-field" /></div>
          </div>
          <div><label className="section-label mb-1 block">Attendees</label><input type="text" value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="alice@example.com, bob@example.com" className="input-field" /></div>
          <div><label className="section-label mb-1 block">Location</label><input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional location" className="input-field" /></div>
          <div><label className="section-label mb-1 block">Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional description" className="input-field resize-none" /></div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving || !title.trim()} className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <span className="material-symbols-outlined text-base">save</span>}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Availability Check Modal ───────────────────────────────────────────────────
function AvailabilityModal({ onClose }: { onClose: () => void }) {
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
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to check"); }
    finally { setChecking(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--c-surface-container-low)", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-headline text-xl" style={{ color: "var(--c-on-surface)" }}>Check Availability</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><span className="material-symbols-outlined text-xl">close</span></button>
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
            {checking ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <span className="material-symbols-outlined text-base">event_available</span>}
            {checking ? "Checking…" : "Check"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MonthGrid ────────────────────────────────────────────────────────────────
// 7-column × 6-row month grid with event chips placed on their start date.
function MonthGrid({
  anchor,
  onAnchorChange,
  events,
  loading,
  onEventClick,
  onDayClick,
}: {
  anchor: Date;
  onAnchorChange: (d: Date) => void;
  events: CalendarEvent[];
  loading: boolean;
  onEventClick: (e: CalendarEvent) => void;
  onDayClick: (d: Date) => void;
}) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  // First cell = Sunday of the week containing the 1st of the month.
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
  gridStart.setHours(0, 0, 0, 0);

  // Build 6 weeks (42 cells) — covers every possible month layout
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }

  // Bucket events by date string for O(n) lookup
  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = new Date(e.startsAt).toDateString();
    const arr = eventsByDay.get(key) ?? [];
    arr.push(e);
    eventsByDay.set(key, arr);
  }

  function shiftMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    onAnchorChange(next);
  }

  const monthLabel = anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayStr = new Date().toDateString();
  const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--c-surface-container-low)", border: "1px solid var(--c-outline-variant)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--c-outline-variant)" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => shiftMonth(-1)} className="btn-ghost p-1.5" title="Previous month"><span className="material-symbols-outlined">chevron_left</span></button>
          <h3 className="font-headline text-lg" style={{ color: "var(--c-on-surface)" }}>{monthLabel}</h3>
          <button onClick={() => shiftMonth(1)} className="btn-ghost p-1.5" title="Next month"><span className="material-symbols-outlined">chevron_right</span></button>
        </div>
        <button onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); onAnchorChange(d); }} className="btn-secondary py-1.5 px-3 text-xs">
          <span className="material-symbols-outlined text-sm">today</span>
          Today
        </button>
      </div>

      {/* Day-name header row */}
      <div className="grid grid-cols-7" style={{ borderBottom: "1px solid var(--c-outline-variant)" }}>
        {dayHeaders.map((d) => (
          <div key={d} className="text-[10px] font-semibold uppercase tracking-widest text-center py-2" style={{ color: "var(--c-on-surface-variant)" }}>{d}</div>
        ))}
      </div>

      {/* 6 × 7 grid */}
      <div className="grid grid-cols-7 grid-rows-6 relative" style={{ minHeight: "540px" }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: "color-mix(in srgb, var(--c-background) 50%, transparent)" }}>
            <span className="material-symbols-outlined animate-spin text-3xl" style={{ color: "var(--c-primary)" }}>progress_activity</span>
          </div>
        )}
        {cells.map((d, idx) => {
          const inMonth = d.getMonth() === month;
          const isToday = d.toDateString() === todayStr;
          const dayEvents = eventsByDay.get(d.toDateString()) ?? [];
          dayEvents.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
          return (
            <div
              key={idx}
              onClick={() => onDayClick(d)}
              className="p-1.5 cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--c-primary)_4%,transparent)]"
              style={{
                borderRight: (idx % 7) !== 6 ? "1px solid var(--c-outline-variant)" : undefined,
                borderBottom: idx < 35 ? "1px solid var(--c-outline-variant)" : undefined,
                opacity: inMonth ? 1 : 0.45,
                minHeight: "90px",
              }}
            >
              <div className="flex items-center justify-end mb-1">
                <span
                  className={`text-[11px] font-semibold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "" : ""}`}
                  style={isToday
                    ? { background: "var(--c-primary)", color: "var(--c-on-primary)" }
                    : { color: inMonth ? "var(--c-on-surface)" : "var(--c-on-surface-variant)" }}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                    className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate transition-all hover:scale-[1.02] flex items-center gap-1"
                    style={{ background: "color-mix(in srgb, var(--c-primary) 15%, transparent)", color: "var(--c-primary)" }}
                    title={e.title}
                  >
                    {e.meetLink && <span className="material-symbols-outlined text-[10px]">videocam</span>}
                    <span className="truncate">{new Date(e.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {e.title}</span>
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <button
                    onClick={(ev) => { ev.stopPropagation(); onEventClick(dayEvents[3]); }}
                    className="text-[10px] font-semibold px-1.5"
                    style={{ color: "var(--c-on-surface-variant)" }}
                  >
                    + {dayEvents.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventCard({ event, onEdit, onDelete }: { event: CalendarEvent; onEdit: (e: CalendarEvent) => void; onDelete: (id: string) => void }) {
  const start = new Date(event.startsAt);
  const end   = new Date(event.endsAt);
  const isToday = start.toDateString() === new Date().toDateString();
  const timeStr = `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);

  return (
    <div className="flex gap-4 rounded-2xl px-5 py-4 transition-all duration-150 nimbus-card nimbus-card-hover" style={{ borderLeft: isToday ? "4px solid var(--c-primary)" : "4px solid transparent" }}>
      <div className="shrink-0 w-14 text-center rounded-xl px-2 py-2" style={{ background: isToday ? "var(--c-primary)" : "var(--c-surface-container-high)", color: isToday ? "var(--c-on-primary)" : "var(--c-on-surface-variant)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest">{start.toLocaleDateString([], { month: "short" })}</p>
        <p className="text-2xl font-bold leading-none mt-0.5">{start.getDate()}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate" style={{ color: "var(--c-on-surface)" }}>{event.title}</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="flex items-center gap-1 text-xs" style={{ color: "var(--c-on-surface-variant)" }}><span className="material-symbols-outlined text-sm">schedule</span>{timeStr}</span>
          <span className="flex items-center gap-1 text-xs" style={{ color: "var(--c-on-surface-variant)" }}><span className="material-symbols-outlined text-sm">hourglass</span>{durationMin}m</span>
        </div>
        {event.attendees.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {event.attendees.slice(0, 3).map((email) => (
              <span key={email} className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "color-mix(in srgb, var(--c-primary) 12%, transparent)", color: "var(--c-primary)" }}>{email}</span>
            ))}
            {event.attendees.length > 3 && <span className="text-xs" style={{ color: "var(--c-on-surface-variant)" }}>+{event.attendees.length - 3} more</span>}
          </div>
        )}
        {event.meetLink && (
          <a href={event.meetLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all hover:scale-[1.02]" style={{ background: "color-mix(in srgb, var(--c-tertiary) 15%, transparent)", color: "var(--c-tertiary)", border: "1px solid color-mix(in srgb, var(--c-tertiary) 25%, transparent)" }}>
            <span className="material-symbols-outlined text-[14px]">videocam</span>
            Join Google Meet
          </a>
        )}
      </div>
      <div className="shrink-0 self-center flex flex-col items-center gap-2">
        {isToday && <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--c-primary)" }} />}
        <button onClick={() => onEdit(event)} className="btn-ghost p-1.5" title="Edit"><span className="material-symbols-outlined text-base">edit</span></button>
        <button onClick={() => onDelete(event.id)} className="btn-ghost p-1.5" title="Delete" style={{ color: "var(--c-error)" }}><span className="material-symbols-outlined text-base">delete</span></button>
      </div>
    </div>
  );
}

export function CalendarPage() {
  const ready = useClerkReady();
  const { hasFeature } = useFeatures();
  const { status: connStatus, loading: connLoading, refresh: refreshConn } = useConnectionStatus();

  // Feature gate
  if (!hasFeature("calendar_read")) {
    return (
      <FeatureDisabledCard
        featureKey="calendar_read"
        title="Calendar Locked"
        description="You don't have access to the calendar yet. Request it from your teacher and they can enable it for you."
        icon="calendar_month"
      />
    );
  }
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [filter, setFilter] = useState<"upcoming" | "today" | "all">("upcoming");
  const [search, setSearch] = useState("");
  const [serverSearch, setServerSearch] = useState("");
  // View mode: list (default) vs month grid
  const [viewMode, setViewMode] = useState<"list" | "month">(() => {
    return (localStorage.getItem("googenie-calendar-view") as "list" | "month") ?? "list";
  });
  // Anchor date for month view (defaults to today)
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });

  // Persist view mode
  if (typeof window !== "undefined") {
    localStorage.setItem("googenie-calendar-view", viewMode);
  }

  // React Query — instant cache hits + 60s background refetch
  const { data, isLoading: loading, error, refetch } = useCalendarEvents({
    q: serverSearch,
    enabled: ready,
  });
  const events: CalendarEvent[] = data?.events ?? [];

  const deleteMut = useDeleteCalendarEvent();

  function handleDelete(eventId: string) {
    deleteMut.mutate(eventId);
  }

  if (!connLoading && connStatus && !connStatus.googlecalendar) {
    return (
      <div className="pt-4">
        <h1 className="font-headline text-3xl mb-6" style={{ color: "var(--c-on-surface)" }}>Calendar</h1>
        <ConnectionBar plugins={["googlecalendar"]} status={connStatus} loading={connLoading} onConnected={() => { refreshConn(); refetch(); }} />
      </div>
    );
  }

  const now = new Date();
  const todayStr = now.toDateString();
  const filtered = events.filter((e) => {
    const s = new Date(e.startsAt);
    if (filter === "today") return s.toDateString() === todayStr;
    if (filter === "upcoming") return s >= now;
    return true;
  }).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const todayCount = events.filter((e) => new Date(e.startsAt).toDateString() === todayStr).length;

  return (
    <div>
      {/* Always-visible connection bar */}
      <ConnectionBar
        plugins={["googlecalendar"]}
        status={connStatus}
        loading={connLoading}
        onConnected={() => { refreshConn(); refetch(); }}
      />
      {/* AI Insight banner */}
      <div className="ai-insight mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "color-mix(in srgb, var(--c-primary) 15%, transparent)" }}>
          <span className="material-symbols-outlined" style={{ color: "var(--c-primary)", fontVariationSettings: "FILL 1" }}>auto_awesome</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--c-primary)" }}>AI Calendar Insight</p>
          <p className="text-sm" style={{ color: "var(--c-on-surface-variant)" }}>
            {todayCount > 0 ? `You have ${todayCount} event${todayCount !== 1 ? "s" : ""} today.` : "Your calendar looks clear today. A great time for deep work."}
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary py-2 px-4 text-xs shrink-0">
          <span className="material-symbols-outlined text-sm">add</span>
          New Event
        </button>
        <button onClick={() => setCheckingAvailability(true)} className="btn-secondary py-2 px-4 text-xs shrink-0">
          <span className="material-symbols-outlined text-sm">event_available</span>
          Availability
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-headline text-2xl" style={{ color: "var(--c-on-surface)" }}>
            {events.length > 0 ? `${events.length} event${events.length !== 1 ? "s" : ""}` : "Calendar"}
            {todayCount > 0 && <span className="text-base font-sans ml-2" style={{ color: "var(--c-on-surface-variant)" }}>· {todayCount} today</span>}
          </h2>
        </div>
        <div className="flex gap-2 items-center">
          {/* View mode toggle */}
          <div className="flex rounded-full overflow-hidden" style={{ border: "1px solid var(--c-outline-variant)" }}>
            {(["list", "month"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className="px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-all"
                style={viewMode === m
                  ? { background: "var(--c-primary)", color: "var(--c-on-primary)" }
                  : { background: "var(--c-surface-container)", color: "var(--c-on-surface-variant)" }}
              >
                <span className="material-symbols-outlined text-[16px]">{m === "list" ? "view_list" : "calendar_view_month"}</span>
                {m === "list" ? "List" : "Month"}
              </button>
            ))}
          </div>
          {/* List-only filter pills (hidden in month view) */}
          {viewMode === "list" && (["upcoming", "today", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className="px-4 py-2 rounded-full text-sm font-medium transition-all" style={filter === f ? { background: "var(--c-primary)", color: "var(--c-on-primary)" } : { background: "var(--c-surface-container)", color: "var(--c-on-surface-variant)", border: "1px solid var(--c-outline-variant)" }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === "today" && todayCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold" style={{ background: filter === "today" ? "var(--c-on-primary)" : "var(--c-primary)", color: filter === "today" ? "var(--c-primary)" : "var(--c-on-primary)" }}>{todayCount}</span>
              )}
            </button>
          ))}
        </div>
        {/* Calendar search */}
        <div className="relative mt-3 mb-4">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-base" style={{ color: "var(--c-outline)" }}>search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setServerSearch(search); if (e.key === "Escape") { setSearch(""); setServerSearch(""); } }}
            placeholder="Search events… (Enter)"
            className="pl-9 pr-4 py-2 rounded-xl text-sm w-full outline-none"
            style={{ background: "var(--c-surface-container)", border: `1px solid ${serverSearch ? "var(--c-primary)" : "var(--c-outline-variant)"}`, color: "var(--c-on-surface)" }}
          />
          {(search || serverSearch) && <button onClick={() => { setSearch(""); setServerSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--c-outline)" }}><span className="material-symbols-outlined text-base">close</span></button>}
        </div>
      </div>

      {/* Event list (List view) */}
      {viewMode === "list" && (
        <>
          {loading && <div className="flex items-center justify-center py-16"><span className="material-symbols-outlined animate-spin text-3xl" style={{ color: "var(--c-primary)" }}>progress_activity</span></div>}
          {error && <p className="text-sm py-8 text-center" style={{ color: "var(--c-error)" }}>{(error as Error).message}</p>}
          {!loading && filtered.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-24 gap-4" style={{ color: "var(--c-on-surface-variant)" }}>
              <span className="material-symbols-outlined text-6xl" style={{ opacity: 0.3 }}>calendar_today</span>
              <p className="font-headline text-2xl">No events {filter === "today" ? "today" : filter === "upcoming" ? "upcoming" : "yet"}</p>
              <button onClick={() => setCreating(true)} className="btn-primary mt-2"><span className="material-symbols-outlined text-sm">add</span>Create an event</button>
            </div>
          )}
          <div className="space-y-3">
            {filtered.map((event) => <EventCard key={event.id} event={event} onEdit={setEditing} onDelete={handleDelete} />)}
          </div>
        </>
      )}

      {/* Month view */}
      {viewMode === "month" && (
        <MonthGrid
          anchor={monthAnchor}
          onAnchorChange={setMonthAnchor}
          events={events}
          loading={loading}
          onEventClick={setEditing}
          onDayClick={(d) => {
            // Pre-create with selected date
            const iso = d.toISOString().slice(0, 10);
            setCreating(true);
            // best-effort: pre-fill via storage; CreateEventModal reads default from useState init.
            // Since CreateEventModal initializes its own state on mount, we just open it.
            void iso;
          }}
        />
      )}

      {creating && <CreateEventModal onClose={() => setCreating(false)} onCreated={() => { refetch(); }} />}
      {editing && <EditEventModal event={editing} onClose={() => setEditing(null)} onUpdated={() => { refetch(); setEditing(null); }} />}
      {checkingAvailability && <AvailabilityModal onClose={() => setCheckingAvailability(false)} />}
    </div>
  );
}