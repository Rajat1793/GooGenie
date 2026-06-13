import { useEffect, useState } from "react";
import { calendarApi, type CalendarEvent } from "../api/client.ts";
import { useClerkReady } from "../hooks/useClerkReady.ts";
import { ConnectBanner, useConnectionStatus } from "../components/ConnectBanner.tsx";

function CreateEventModal({ onClose, onCreated }: { onClose: () => void; onCreated: (e: CalendarEvent) => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [attendees, setAttendees] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleCreate() {
    if (!title.trim()) { setErr("Title is required"); return; }
    setErr(null); setSaving(true);
    try {
      const starts_at = new Date(`${date}T${startTime}`).toISOString();
      const ends_at   = new Date(`${date}T${endTime}`).toISOString();
      const res = await calendarApi.createEvent({ title, starts_at, ends_at, attendees: attendees.split(",").map(s => s.trim()).filter(Boolean) });
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

function EventCard({ event, onEdit }: { event: CalendarEvent; onEdit: (e: CalendarEvent) => void }) {
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
      </div>
      <div className="shrink-0 self-center flex flex-col items-center gap-2">
        {isToday && <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--c-primary)" }} />}
        <button onClick={() => onEdit(event)} className="btn-ghost p-1.5" title="Edit"><span className="material-symbols-outlined text-base">edit</span></button>
      </div>
    </div>
  );
}

export function CalendarPage() {
  const ready = useClerkReady();
  const { status: connStatus, loading: connLoading, refresh: refreshConn } = useConnectionStatus();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [filter, setFilter] = useState<"upcoming" | "today" | "all">("upcoming");

  function loadEvents() {
    if (!ready) return;
    setLoading(true);
    calendarApi.listEvents().then((r) => setEvents(r.events)).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }
  useEffect(() => { loadEvents(); }, [ready]);

  if (!connLoading && connStatus && !connStatus.googlecalendar) {
    return (
      <div className="pt-4">
        <h1 className="font-headline text-3xl mb-6" style={{ color: "var(--c-on-surface)" }}>Calendar</h1>
        <ConnectBanner plugin="googlecalendar" onConnected={() => { refreshConn(); loadEvents(); }} />
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
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-headline text-2xl" style={{ color: "var(--c-on-surface)" }}>
            {events.length > 0 ? `${events.length} event${events.length !== 1 ? "s" : ""}` : "Calendar"}
            {todayCount > 0 && <span className="text-base font-sans ml-2" style={{ color: "var(--c-on-surface-variant)" }}>· {todayCount} today</span>}
          </h2>
        </div>
        <div className="flex gap-2">
          {(["upcoming", "today", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className="px-4 py-2 rounded-full text-sm font-medium transition-all" style={filter === f ? { background: "var(--c-primary)", color: "var(--c-on-primary)" } : { background: "var(--c-surface-container)", color: "var(--c-on-surface-variant)", border: "1px solid var(--c-outline-variant)" }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === "today" && todayCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold" style={{ background: filter === "today" ? "var(--c-on-primary)" : "var(--c-primary)", color: filter === "today" ? "var(--c-primary)" : "var(--c-on-primary)" }}>{todayCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Event list */}
      {loading && <div className="flex items-center justify-center py-16"><span className="material-symbols-outlined animate-spin text-3xl" style={{ color: "var(--c-primary)" }}>progress_activity</span></div>}
      {error && <p className="text-sm py-8 text-center" style={{ color: "var(--c-error)" }}>{error}</p>}
      {!loading && filtered.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-24 gap-4" style={{ color: "var(--c-on-surface-variant)" }}>
          <span className="material-symbols-outlined text-6xl" style={{ opacity: 0.3 }}>calendar_today</span>
          <p className="font-headline text-2xl">No events {filter === "today" ? "today" : filter === "upcoming" ? "upcoming" : "yet"}</p>
          <button onClick={() => setCreating(true)} className="btn-primary mt-2"><span className="material-symbols-outlined text-sm">add</span>Create an event</button>
        </div>
      )}
      <div className="space-y-3">
        {filtered.map((event) => <EventCard key={event.id} event={event} onEdit={setEditing} />)}
      </div>

      {creating && <CreateEventModal onClose={() => setCreating(false)} onCreated={(e) => { setEvents((prev) => [...prev, e]); }} />}
    </div>
  );
}
