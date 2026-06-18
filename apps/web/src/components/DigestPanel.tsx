/**
 * DigestPanel — "What's on my plate" dashboard widget (feature: daily_digest).
 *
 * Fetches /api/v1/me/digest and renders:
 *   1. AI-synthesized one-paragraph summary
 *   2. Top reply-needed threads (click → open in inbox)
 *   3. Today's upcoming meetings
 *   4. Open AI tasks (top 5)
 *   5. Pending feature requests (managers only)
 *
 * Designed to sit on the Profile page or any future /today route.
 */
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { aiApi, type DigestResponse } from "../api/client";
import { useFeatures } from "../contexts/FeatureContext";
import { Icon } from "./Icon";

export function DigestPanel() {
  const router = useRouter();
  const { loading: featuresLoading } = useFeatures();
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await aiApi.digest();
      setDigest(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load digest";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Wait until the FeatureContext finishes loading so the parent's
    // hasFeature("daily_digest") gate has been resolved. Without this we'd
    // optimistically fire /me/digest under the permissive default and get
    // a noisy 403 in the browser console for users without the add-on.
    if (featuresLoading) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featuresLoading]);

  if (loading) {
    return (
      <div
        className="rounded-2xl p-5 flex items-center gap-2"
        style={{
          background: "var(--c-surface-container-low)",
          border: "1px solid var(--c-outline-variant)",
        }}
      >
        <Icon name="progress_activity" className="animate-spin text-base" style={{ color: "var(--c-primary)" }} />
        <span className="text-sm" style={{ color: "var(--c-on-surface-variant)" }}>
          Generating your daily digest…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-2xl p-5"
        style={{
          background: "var(--c-error-container)",
          border: "1px solid var(--c-error)",
          color: "var(--c-error)",
        }}
      >
        <p className="text-sm">Couldn&rsquo;t load digest: {error}</p>
      </div>
    );
  }

  if (!digest) return null;

  const hasAnything =
    digest.reply_needed.length > 0 ||
    digest.upcoming_meetings.length > 0 ||
    digest.tasks.length > 0 ||
    digest.pending_requests.length > 0;

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "var(--c-surface-container-low)",
        border: "1px solid var(--c-outline-variant)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon name="today" className="text-base" style={{ color: "var(--c-primary)" }} />
          <h3 className="font-semibold text-sm" style={{ color: "var(--c-on-surface)" }}>
            What&rsquo;s on my plate
          </h3>
          {digest.ai_available && digest.model && (
            <span className="text-[10px] font-semibold" style={{ color: "var(--c-outline)" }}>
              {digest.model}
            </span>
          )}
        </div>
        <button onClick={() => void load()} className="btn-ghost text-xs" title="Refresh">
          <Icon name="refresh" className="text-sm" />
        </button>
      </div>

      {/* AI Summary */}
      {digest.summary && (
        <div
          className="rounded-xl px-4 py-3 mb-4"
          style={{
            background: "color-mix(in srgb, var(--c-primary) 7%, transparent)",
            border: "1px solid color-mix(in srgb, var(--c-primary) 20%, transparent)",
          }}
        >
          <p className="text-sm leading-relaxed" style={{ color: "var(--c-on-surface)" }}>
            {digest.summary}
          </p>
        </div>
      )}

      {!hasAnything && !digest.summary && (
        <p className="text-xs text-on-surface-variant py-3">
          Nothing on your plate right now.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Reply-needed */}
        {digest.reply_needed.length > 0 && (
          <Section title="Awaiting Reply" icon="hourglass">
            {digest.reply_needed.map((t) => (
              <Row
                key={t.threadId}
                onClick={() => router.push(`/inbox?thread=${t.threadId}`)}
                left={<Icon name="mark_email_unread" className="text-sm text-primary" />}
                title={t.subject}
                meta={`${t.from} · ${t.daysWaiting ?? 0}d waiting`}
              />
            ))}
          </Section>
        )}

        {/* Upcoming meetings */}
        {digest.upcoming_meetings.length > 0 && (
          <Section title="Today's Meetings" icon="event">
            {digest.upcoming_meetings.map((m) => {
              const when = new Date(m.starts_at);
              return (
                <Row
                  key={m.id}
                  onClick={() => router.push(`/calendar`)}
                  left={<Icon name="event" className="text-sm" style={{ color: "var(--c-secondary)" }} />}
                  title={m.title}
                  meta={`${when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${m.attendees.length} attendee${m.attendees.length === 1 ? "" : "s"}`}
                />
              );
            })}
          </Section>
        )}

        {/* Open tasks */}
        {digest.tasks.length > 0 && (
          <Section title="Open Tasks" icon="task_alt">
            {digest.tasks.map((t) => (
              <Row
                key={t.id}
                onClick={() => router.push(`/inbox?thread=${t.threadId}`)}
                left={
                  <Icon
                    name="task_alt"
                    className="text-sm"
                    style={{ color: t.priority === "high" ? "var(--c-error)" : "var(--c-tertiary)" }}
                  />
                }
                title={t.title}
                meta={t.deadline ? `Due ${new Date(t.deadline).toLocaleDateString()}` : `${t.priority}`}
              />
            ))}
          </Section>
        )}

        {/* Pending requests (manager-only) */}
        {digest.pending_requests.length > 0 && (
          <Section title="Pending Requests" icon="request_quote">
            {digest.pending_requests.map((r) => (
              <Row
                key={r.id}
                onClick={() => router.push(`/profile`)}
                left={<Icon name="request_quote" className="text-sm" style={{ color: "var(--c-tertiary)" }} />}
                title={r.feature_key.replace(/_/g, " ")}
                meta={`From ${r.requester_user_id} · ${new Date(r.created_at).toLocaleDateString()}`}
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1" style={{ color: "var(--c-on-surface-variant)" }}>
        <Icon name={icon} className="text-xs" />
        {title}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ onClick, left, title, meta }: { onClick?: () => void; left: React.ReactNode; title: string; meta: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg px-2.5 py-2 flex items-start gap-2 hover:bg-primary/5 transition-colors"
      style={{ background: "var(--c-surface-container)", border: "1px solid var(--c-outline-variant)" }}
    >
      <div className="shrink-0 mt-0.5">{left}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: "var(--c-on-surface)" }}>{title}</p>
        <p className="text-[10px] truncate" style={{ color: "var(--c-on-surface-variant)" }}>{meta}</p>
      </div>
    </button>
  );
}
