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

// Simple email validation regex (similar to common browsers)
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function PublicBookingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [meta, setMeta] = useState<BookingMeta | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<SlotDef | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{ start: string; end: string; meet?: string | null } | null>(null);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);

  const isEmailValid = email.trim() === "" || emailRegex.test(email.trim());
  const canSubmit = selected && name.trim() && isEmailValid && email.trim() && !busy;

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
    if (!isEmailValid) {
      setEmailError("Please enter a valid email address");
      return;
    }
    setBusy(true);
    setConfirmErr(null);
    setEmailError(null);
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
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: "var(--c-background)", color: "var(--c-on-surface)" }}
      >
        <div className="nimbus-card max-w-md w-full text-center space-y-3 p-8">
          <h1 className="font-headline text-2xl font-bold" style={{ color: "var(--c-on-surface)" }}>
            Link unavailable
          </h1>
          <p className="text-sm" style={{ color: "var(--c-on-surface-variant)" }}>{loadErr}</p>
        </div>
      </div>
    );
  }

  if (!meta) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: "var(--c-background)" }}
      >
        <div className="text-sm" style={{ color: "var(--c-on-surface-variant)" }}>Loading…</div>
      </div>
    );
  }

  if (confirmation) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: "var(--c-background)", color: "var(--c-on-surface)" }}
      >
        <div className="nimbus-card max-w-md w-full p-8 text-center space-y-4">
          <div
            className="mx-auto w-14 h-14 rounded-full flex items-center justify-center text-2xl"
            style={{ background: "var(--c-primary-container)", color: "var(--c-primary)" }}
            aria-hidden
          >
            ✓
          </div>
          <h1 className="font-headline text-2xl font-bold" style={{ color: "var(--c-on-surface)" }}>
            You&rsquo;re booked!
          </h1>
          <p className="text-sm" style={{ color: "var(--c-on-surface-variant)" }}>
            {new Date(confirmation.start).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
            {" "}–{" "}
            {new Date(confirmation.end).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </p>
          <p className="text-xs" style={{ color: "var(--c-on-surface-variant)" }}>
            An invite has been sent to {email}. Check your inbox.
          </p>
          {confirmation.meet && (
            <a
              href={confirmation.meet}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
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
    <div
      className="min-h-screen"
      style={{ background: "var(--c-background)", color: "var(--c-on-surface)" }}
    >
      <div className="max-w-3xl mx-auto px-6 py-12">
        <header className="mb-8 text-center">
          <div
            className="mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center text-xl"
            style={{ background: "var(--c-primary-container)", color: "var(--c-primary)" }}
            aria-hidden
          >
            📅
          </div>
          <h1 className="font-headline text-3xl font-bold" style={{ color: "var(--c-on-surface)" }}>
            {meta.title}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--c-on-surface-variant)" }}>
            {meta.duration_minutes} minutes · Pick a time that works for you
          </p>
        </header>

        <div className="grid md:grid-cols-[1fr_320px] gap-6">
          {/* Slots */}
          <div className="nimbus-card p-6">
            {meta.slots.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "var(--c-on-surface-variant)" }}>
                No available slots in the next two weeks. Try again later.
              </p>
            ) : (
              <div className="space-y-6">
                {[...grouped.entries()].slice(0, 7).map(([day, daySlots]) => (
                  <div key={day}>
                    <h3
                      className="text-[10px] font-bold uppercase tracking-widest mb-2"
                      style={{ color: "var(--c-on-surface-variant)" }}
                    >
                      {new Date(day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      {daySlots.map((s) => {
                        const isSelected = selected?.start === s.start;
                        return (
                          <button
                            key={s.start}
                            onClick={() => setSelected(s)}
                            className="px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 active:scale-[0.98]"
                            style={
                              isSelected
                                ? {
                                    background: "var(--c-primary)",
                                    color: "var(--c-on-primary)",
                                    border: "1px solid var(--c-primary)",
                                  }
                                : {
                                    background: "var(--c-surface-container-lowest)",
                                    color: "var(--c-on-surface)",
                                    border: "1px solid var(--c-outline-variant)",
                                  }
                            }
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
          <aside className="nimbus-card p-6 sticky top-6 self-start">
            <h2
              className="font-headline text-sm font-bold mb-3"
              style={{ color: "var(--c-on-surface)" }}
            >
              {selected ? "Confirm your booking" : "Pick a time to begin"}
            </h2>
            {selected && (
              <div
                className="mb-4 p-3 rounded-lg text-xs"
                style={{
                  background: "var(--c-primary-container)",
                  color: "var(--c-on-surface)",
                  border: "1px solid var(--c-outline-variant)",
                }}
              >
                <div className="font-semibold">
                  {new Date(selected.start).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
                <div style={{ color: "var(--c-on-surface-variant)" }}>
                  {meta.duration_minutes} min
                </div>
              </div>
            )}
            <div className="space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                disabled={!selected}
                className="input-field disabled:opacity-50"
              />
              <div>
                <input
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (e.target.value.trim() && !emailRegex.test(e.target.value.trim())) {
                      setEmailError("Enter a valid email address");
                    } else {
                      setEmailError(null);
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value.trim() && !emailRegex.test(e.target.value.trim())) {
                      setEmailError("Enter a valid email address");
                    } else {
                      setEmailError(null);
                    }
                  }}
                  placeholder="you@example.com"
                  disabled={!selected}
                  type="email"
                  className="input-field disabled:opacity-50"
                  style={emailError && email.trim() ? { borderColor: "var(--c-error, #b3261e)" } : {}}
                />
                {emailError && (
                  <p className="text-xs mt-1" style={{ color: "var(--c-error, #b3261e)" }}>
                    {emailError}
                  </p>
                )}
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What's this about? (optional)"
                disabled={!selected}
                rows={3}
                className="input-field disabled:opacity-50 resize-none"
              />
              {confirmErr && (
                <p className="text-xs" style={{ color: "var(--c-error, #b3261e)" }}>
                  {confirmErr}
                </p>
              )}
              <button
                onClick={handleConfirm}
                disabled={!canSubmit}
                className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? "Booking…" : "Confirm booking"}
              </button>
              <p className="text-[10px] text-center" style={{ color: "var(--c-on-surface-variant)" }}>
                Powered by GooGenie
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
