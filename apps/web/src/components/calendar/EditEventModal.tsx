"use client";

/**
 * Edit-event modal. Extracted from CalendarPage.
 */
import { useState } from "react";
import { calendarApi, type CalendarEvent } from "../../api/client";
import { getErrorMessage } from "../../lib/errors";
import { Icon } from "../../components/Icon";

interface EditEventModalProps {
  event: CalendarEvent;
  onClose: () => void;
  onUpdated: (e: CalendarEvent) => void;
}

export function EditEventModal({ event, onClose, onUpdated }: EditEventModalProps) {
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
    } catch (e) { setErr(getErrorMessage(e, "Failed to update")); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--c-surface-container-low)", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-headline text-xl" style={{ color: "var(--c-on-surface)" }}>Edit Event</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><Icon name="close" className="text-xl" /></button>
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
            {saving ? <Icon name="progress_activity" className="animate-spin text-base" /> : <Icon name="save" className="text-base" />}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
