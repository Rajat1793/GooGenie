"use client";

/**
 * MeetingBriefPanel — fetches /ai/meetings/:eventId/brief lazily on open
 * and renders an attendee-by-attendee history + AI brief.
 *
 * Mounted inline below an event card so it doesn't steal focus from the
 * main calendar list.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { aiApi, type MeetingBriefResponse } from "../../api/client";
import { Icon } from "../../components/Icon";

interface Props {
  eventId: string;
  onClose: () => void;
}

export function MeetingBriefPanel({ eventId, onClose }: Props) {
  const router = useRouter();
  const [data, setData] = useState<MeetingBriefResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await aiApi.meetingBrief(eventId);
        if (!cancelled) setData(r);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load brief");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  return (
    <div
      className="rounded-2xl p-5 relative"
      style={{
        background: "color-mix(in srgb, var(--c-tertiary) 6%, var(--c-surface-container))",
        border: "1px solid color-mix(in srgb, var(--c-tertiary) 25%, transparent)",
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-3 right-3 btn-ghost p-1 rounded-full"
        title="Close brief"
        style={{ color: "var(--c-on-surface-variant)" }}
      >
        <Icon name="close" className="text-base" />
      </button>
      <div className="flex items-center gap-2 mb-3 pr-7">
        <Icon name="auto_awesome" className="text-base" style={{ color: "var(--c-tertiary)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--c-tertiary)" }}>MEETING BRIEF</span>
        {data?.ai_available === false && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "var(--c-surface-container-high)", color: "var(--c-on-surface-variant)" }}>
            AI off
          </span>
        )}
      </div>
      {loading && (
        <p className="text-xs italic" style={{ color: "var(--c-on-surface-variant)" }}>
          Reading recent emails with each attendee…
        </p>
      )}
      {err && (
        <p className="text-xs" style={{ color: "var(--c-error)" }}>{err}</p>
      )}
      {data && (
        <div className="space-y-3 text-sm" style={{ color: "var(--c-on-surface)" }}>
          {data.brief ? (
            <p className="whitespace-pre-wrap">{data.brief}</p>
          ) : (
            data.hint && (
              <p className="text-xs italic" style={{ color: "var(--c-on-surface-variant)" }}>{data.hint}</p>
            )
          )}
          {data.attendees && data.attendees.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--c-on-surface-variant)" }}>
                Recent threads per attendee
              </p>
              <div className="space-y-2">
                {data.attendees.map((a) => (
                  <div key={a.email}>
                    <p className="text-[11px] font-semibold" style={{ color: "var(--c-on-surface)" }}>{a.email}</p>
                    {a.recent_threads.length === 0 ? (
                      <p className="text-[11px] italic" style={{ color: "var(--c-on-surface-variant)" }}>No recent email history.</p>
                    ) : (
                      <ul className="space-y-1 mt-1">
                        {a.recent_threads.slice(0, 3).map((t) => (
                          <li key={t.thread_id}>
                            <button
                              onClick={() => router.push(`/inbox?thread=${encodeURIComponent(t.thread_id)}`)}
                              className="text-left w-full px-2 py-1 rounded text-[11px] flex items-start gap-2"
                              style={{ background: "var(--c-surface-container)", color: "var(--c-on-surface)" }}
                            >
                              <Icon name="mail" className="text-sm shrink-0 mt-0.5" style={{ color: t.direction === "outbound" ? "var(--c-tertiary)" : "var(--c-primary)" }} />
                              <span className="flex-1 min-w-0">
                                <span className="block font-semibold truncate">{t.subject}</span>
                                <span className="block opacity-70 truncate">{t.snippet}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.related_threads && data.related_threads.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--c-on-surface-variant)" }}>
                Related past emails
              </p>
              <ul className="space-y-1">
                {data.related_threads.slice(0, 3).map((r) => (
                  <li key={r.thread_id}>
                    <button
                      onClick={() => router.push(`/inbox?thread=${encodeURIComponent(r.thread_id)}`)}
                      className="text-left w-full px-2 py-1 rounded text-[11px] flex items-start gap-2"
                      style={{ background: "var(--c-surface-container)", color: "var(--c-on-surface)" }}
                    >
                      <Icon name="auto_awesome" className="text-sm shrink-0 mt-0.5" style={{ color: "var(--c-tertiary)" }} />
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold truncate">{r.subject}</span>
                        {r.from && <span className="block opacity-70 truncate">{r.from}</span>}
                      </span>
                      {r.similarity !== undefined && (
                        <span
                          className="text-[9px] px-1 rounded font-bold"
                          style={{ background: "var(--c-tertiary-container)", color: "var(--c-on-tertiary-container)" }}
                        >
                          {Math.round(r.similarity * 100)}%
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
