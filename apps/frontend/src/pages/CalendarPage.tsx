import { useEffect, useState } from "react";
import { calendarApi, type CalendarEvent } from "../api/client.ts";
import { useClerkReady } from "../hooks/useClerkReady.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { DataState } from "../components/DataState.tsx";

// ── Create event modal ────────────────────────────────────────────────────────
function CreateEventModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: (event: CalendarEvent) => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [attendees, setAttendees] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleCreate() {
    if (!title.trim()) { setErr("Title is required"); return; }
    setErr(null);
    setSaving(true);
    try {
      const starts_at = new Date(`${date}T${startTime}`).toISOString();
      const ends_at = new Date(`${date}T${endTime}`).toISOString();
      const attendeeList = attendees.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await calendarApi.createEvent({ title, starts_at, ends_at, attendees: attendeeList });
      onCreated(res.event);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create event");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/20 backdrop-blur-sm">
      <div className="glass-panel rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-headline text-xl text-ink-text">New Event</h2>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="space-y-4">
          {err && (
            <div className="rounded-xl bg-error-container px-4 py-2.5 text-sm text-error">{err}</div>
          )}
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">
              Title <span className="text-error">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className="input-field rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-field rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">
                Start
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="input-field rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">
                End
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="input-field rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">
              Attendees <span className="text-outline font-normal normal-case tracking-normal">(comma-separated emails)</span>
            </label>
            <input
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="alice@example.com, bob@example.com"
              className="input-field rounded-xl"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={saving || !title.trim()}
            className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-base">add</span>
            )}
            {saving ? "Creating…" : "Create Event"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Event card ────────────────────────────────────────────────────────────────
function EventCard({ event }: { event: CalendarEvent }) {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const isToday = start.toDateString() === new Date().toDateString();

  const timeStr = `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const dateStr = start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);

  return (
    <div className={`glass-panel rounded-2xl px-5 py-4 flex gap-4 border-l-4 ${isToday ? "border-l-primary" : "border-l-outline-variant/30"}`}>
      {/* Date block */}
      <div className={`shrink-0 w-14 text-center rounded-xl px-2 py-2 ${isToday ? "bg-primary text-white" : "bg-surface-container-low text-on-surface-variant"}`}>
        <p className="text-[10px] font-semibold uppercase tracking-widest">
          {start.toLocaleDateString([], { month: "short" })}
        </p>
        <p className="text-2xl font-bold leading-none mt-0.5">
          {start.getDate()}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-ink-text text-sm truncate">{event.title}</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="flex items-center gap-1 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-base">schedule</span>
            {timeStr}
          </span>
          <span className="flex items-center gap-1 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-base">hourglass</span>
            {durationMin}m
          </span>
          {!isToday && (
            <span className="text-xs text-on-surface-variant">{dateStr}</span>
          )}
        </div>
        {event.attendees.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className="material-symbols-outlined text-base text-on-surface-variant">group</span>
            {event.attendees.slice(0, 3).map((email) => (
              <span
                key={email}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container text-[10px] font-medium"
              >
                {email}
              </span>
            ))}
            {event.attendees.length > 3 && (
              <span className="text-xs text-on-surface-variant">+{event.attendees.length - 3} more</span>
            )}
          </div>
        )}
      </div>

      {/* Status dot */}
      {isToday && (
        <div className="shrink-0 self-center">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        </div>
      )}
    </div>
  );
}

// ── Main CalendarPage ─────────────────────────────────────────────────────────
export function CalendarPage() {
  const ready = useClerkReady();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<"upcoming" | "today" | "all">("upcoming");

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    calendarApi.listEvents()
      .then((r) => setEvents(r.events))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ready]);

  const now = new Date();
  const todayStr = now.toDateString();

  const filtered = events.filter((e) => {
    const start = new Date(e.startsAt);
    if (filter === "today") return start.toDateString() === todayStr;
    if (filter === "upcoming") return start >= now;
    return true;
  }).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const todayCount = events.filter((e) => new Date(e.startsAt).toDateString() === todayStr).length;

  return (
    <div className="pt-8">
      <PageHeader
        title="Calendar"
        subtitle={events.length > 0 ? `${events.length} event${events.length !== 1 ? "s" : ""}${todayCount > 0 ? ` · ${todayCount} today` : ""}` : ""}
        action={
          <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-2">
            <span className="material-symbols-outlined text-base">add</span>
            New Event
          </button>
        }
      />

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {(["upcoming", "today", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              filter === f
                ? "bg-primary text-white shadow-sm"
                : "glass-panel text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "today" && todayCount > 0 && (
              <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${filter === "today" ? "bg-white text-primary" : "bg-primary text-white"}`}>
                {todayCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <DataState loading={loading} error={error} empty="No events found" show={filtered.length > 0}>
        <div className="space-y-3">
          {filtered.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </DataState>

      {creating && (
        <CreateEventModal
          onClose={() => setCreating(false)}
          onCreated={(event) => setEvents((prev) => [...prev, event])}
        />
      )}
    </div>
  );
}
