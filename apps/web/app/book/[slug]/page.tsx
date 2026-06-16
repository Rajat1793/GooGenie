"use client";

/**
 * Public Calendly-style booking page.
 *
 * GET /api/v1/booking/:slug/slots → render available slots grouped by day.
 * On click: collect visitor name+email → POST /api/v1/booking/:slug/confirm.
 *
 * No auth, no Shell — minimal layout so external visitors don't see the
 * sidebar/Clerk widgets.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface SlotDef {
  start: string;
  end: string;
}

interface BookingMeta {
  slug: string;
  title: string;
  duration_minutes: number;
  slots: SlotDef[];
}

export default function PublicBookingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [meta, setMeta] = useState<BookingMeta | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<SlotDef | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{ start: string; end: string; meet?: string | null } | null>(null);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/booking/${encodeURIComponent(slug)}/slots`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) setLoadErr(body.error ?? "Booking link not found");
          return;
        }
        const data = (await res.json()) as BookingMeta;
        if (!cancelled) setMeta(data);
      } catch {
        if (!cancelled) setLoadErr("Couldn't load available times — try again later.");
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  async function handleConfirm() {
    if (!selected || !name.trim() || !email.trim()) return;
    setBusy(true);
    setConfirmErr(null);
    try {
      const res = await fetch(`/api/v1/booking/${encodeURIComponent(slug)}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), start: selected.start, notes: notes.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConfirmErr(body.error ?? "Could not confirm the booking.");
        if (body.code === "SLOT_TAKEN") {
          // Reload available slots so the user can re-pick.
          const refresh = await fetch(`/api/v1/booking/${encodeURIComponent(slug)}/slots`);
          if (refresh.ok) setMeta(await refresh.json());
          setSelected(null);
        }
        return;
      }
      setConfirmation({ start: body.starts_at, end: body.ends_at, meet: body.meet_link });
    } catch {
      setConfirmErr("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loadErr) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full text-center space-y-3">
          <h1 className="text-2xl font-bold text-slate-900">Link unavailable</h1>
          <p className="text-sm text-slate-600">{loadErr}</p>
        </div>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="text-sm text-slate-600">Loading…</div>
      </div>
    );
  }

  if (confirmation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h1 className="text-2xl font-bold text-slate-900">You&rsquo;re booked!</h1>
          <p className="text-sm text-slate-600">
            {new Date(confirmation.start).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
            {" "}–{" "}
            {new Date(confirmation.end).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </p>
          <p className="text-xs text-slate-500">An invite has been sent to {email}. Check your inbox.</p>
          {confirmation.meet && (
            <a href={confirmation.meet} target="_blank" rel="noreferrer"
              className="inline-block px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
            >
              Join Google Meet
            </a>
          )}
        </div>
      </div>
    );
  }

  // Group slots by date (YYYY-MM-DD).
  const grouped = new Map<string, SlotDef[]>();
  for (const s of meta.slots) {
    const day = s.start.slice(0, 10);
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day)!.push(s);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <header className="mb-8 text-center">
          <div className="text-3xl mb-1">📅</div>
          <h1 className="text-3xl font-bold text-slate-900">{meta.title}</h1>
          <p className="text-sm text-slate-600 mt-1">
            {meta.duration_minutes} minutes · Pick a time that works for you
          </p>
        </header>

        <div className="grid md:grid-cols-[1fr_320px] gap-6">
          {/* Slots */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            {meta.slots.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">
                No available slots in the next {meta.slots.length === 0 ? "two weeks" : ""}. Try again later.
              </p>
            ) : (
              <div className="space-y-6">
                {[...grouped.entries()].slice(0, 7).map(([day, daySlots]) => (
                  <div key={day}>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                      {new Date(day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      {daySlots.map((s) => {
                        const isSelected = selected?.start === s.start;
                        return (
                          <button
                            key={s.start}
                            onClick={() => setSelected(s)}
                            className={`px-3 py-2 rounded-lg text-sm font-medium transition border ${
                              isSelected
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"
                            }`}
                          >
                            {new Date(s.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Confirm form */}
          <aside className="bg-white rounded-2xl shadow-sm p-6 sticky top-6 self-start">
            <h2 className="text-sm font-bold text-slate-900 mb-3">
              {selected ? "Confirm your booking" : "Pick a time to begin"}
            </h2>
            {selected && (
              <div className="mb-4 p-3 rounded-lg bg-indigo-50 text-indigo-900 text-xs">
                <div className="font-semibold">
                  {new Date(selected.start).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
                <div className="opacity-80">{meta.duration_minutes} min</div>
              </div>
            )}
            <div className="space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                disabled={!selected}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={!selected}
                type="email"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What's this about? (optional)"
                disabled={!selected}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
              {confirmErr && (
                <p className="text-xs text-red-600">{confirmErr}</p>
              )}
              <button
                onClick={handleConfirm}
                disabled={!selected || !name.trim() || !email.trim() || busy}
                className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-indigo-700 transition"
              >
                {busy ? "Booking…" : "Confirm booking"}
              </button>
              <p className="text-[10px] text-slate-400 text-center">
                Powered by GooGenie
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
