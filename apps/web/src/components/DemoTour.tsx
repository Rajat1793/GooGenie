"use client";

/**
 * DemoTour — guided product tour shown on first visit and replayable from
 * the Profile page or Shell button. A series of themed modal cards step
 * the user through GooGenie's major features with Skip / Next / Back.
 *
 * Lifecycle:
 *   - On mount we check `STORAGE_KEYS.tourCompleted`. If missing, the tour
 *     auto-opens after a short grace period (so the page paints first).
 *   - Listens for `window` event `googenie:tour.open` so any "Take the tour"
 *     button anywhere can re-launch it.
 *   - On Skip or Finish we persist the completed flag and dispatch a toast.
 */
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "./Icon";
import { STORAGE_KEYS } from "../lib/storage";
import { emailApi, calendarApi, meApi, connectApi, snippetsApi } from "../api/client";
import { qk } from "../api/queryClient";

interface TourStep {
  icon: string;
  badge: string;
  title: string;
  body: string;
  bullets?: string[];
  /** Optional route to navigate to before showing this step. */
  route?: string;
}

const STEPS: TourStep[] = [
  {
    icon: "auto_awesome",
    badge: "Welcome",
    title: "Welcome to GooGenie",
    body:
      "Your AI-powered workspace for Gmail and Google Calendar. The next few cards will walk you through the major features in under a minute.",
    bullets: [
      "Connect Gmail + Calendar once, work from one place",
      "AI assistants for triage, drafting, and scheduling",
      "Press Skip at any time — you can re-run this tour from Profile",
    ],
  },
  {
    icon: "inbox",
    badge: "Inbox",
    title: "A smarter inbox",
    body:
      "Your Gmail threads, organised by category. Use the folder list in the sidebar to switch between All, Unread, Reply needed, Drafts, Sent, and the standard Gmail tabs.",
    bullets: [
      "Split or stacked layout — Shift+S to toggle",
      "Live search hits Gmail server-side as you type",
      "j / k keys move between threads, Enter opens",
    ],
    route: "/inbox",
  },
  {
    icon: "hourglass",
    badge: "AI triage",
    title: "Reply Needed",
    body:
      "GooGenie scans your inbox and surfaces threads that are actually waiting on you. No more guessing what to answer first — the Reply Needed folder is your action queue.",
    bullets: [
      "AI ranks by urgency and sender importance",
      "One-click open into the reply composer",
    ],
  },
  {
    icon: "edit",
    badge: "Compose",
    title: "AI-powered Compose",
    body:
      "Click Compose to draft a new message. Use AI to generate a draft from a short prompt, match your historical writing style, or expand a snippet with `;hotkey` then Tab.",
    bullets: [
      "Save Draft button keeps work-in-progress safe",
      "Schedule send with a built-in 10-second Undo window",
      "Inline /commands shorten, lengthen, or change tone",
    ],
  },
  {
    icon: "drafts",
    badge: "Drafts & Sent",
    title: "Drafts and Sent folders",
    body:
      "Pick up where you left off. The Drafts folder shows every Gmail draft with inline Send / Edit / Delete. The Sent folder shows everything that's left your outbox.",
  },
  {
    icon: "calendar_today",
    badge: "Calendar",
    title: "Calendar with conflict-aware scheduling",
    body:
      "See your week at a glance, check availability windows, and let GooGenie suggest reschedules when meetings collide.",
    bullets: [
      "Daily gaps banner surfaces wasted free time",
      "Create events directly from email threads",
    ],
    route: "/calendar",
  },
  {
    icon: "event_available",
    badge: "Booking Links",
    title: "Share a public booking link",
    body:
      "Create Calendly-style booking pages so anyone can grab time on your calendar. Configurable duration, days ahead, and business hours per link.",
    bullets: [
      "Copy the public URL with one click",
      "Pause or delete a link when it's no longer needed",
    ],
    route: "/booking-links",
  },
  {
    icon: "code_blocks",
    badge: "Snippets",
    title: "Reusable text snippets",
    body:
      "Save phrases, signatures, or whole reply templates and expand them anywhere in Compose. Type `;hotkey` then Tab and the body inflates at your cursor.",
    route: "/snippets",
  },
  {
    icon: "smart_toy",
    badge: "Assistant",
    title: "Ask GooGenie",
    body:
      "Open the assistant from the sidebar (the sparkle button) to summarise threads, draft replies, find emails, and schedule meetings — all in plain English.",
    bullets: [
      "Press the keyboard shortcut to summon it from anywhere",
      "Context-aware — knows what thread you're reading",
    ],
  },
  {
    icon: "celebration",
    badge: "You're set",
    title: "You're all set!",
    body:
      "That's the tour. Connect Gmail and Calendar in Profile if you haven't already, then dive in. You can re-run this tour anytime from the Profile page.",
  },
];

export function DemoTour() {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  // Auto-open on first visit (once per browser).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = window.localStorage.getItem(STORAGE_KEYS.tourCompleted) === "1";
    if (done) return;
    // Defer one tick so the app shell paints first.
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, []);

  // ── Background warm-up ──────────────────────────────────────────────────
  // While the user is reading the tour, prime React Query with every major
  // resource the app will need. Combined with the route-bundle prefetch in
  // Shell.tsx, this means the first navigation after the tour shows data
  // instantly from cache instead of a loading spinner.
  //
  // We stagger the requests in two waves to avoid saturating the browser's
  // HTTP/1.1 connection pool (~6 sockets per origin in dev). Hammering all
  // seven endpoints simultaneously was leaving requests stuck in PENDING
  // for several seconds — the dev server queues them behind webpack JIT
  // compilation of each route handler.
  useEffect(() => {
    if (!open) return;

    // Wave 1 (immediate, ~400ms after open): the four most-visited reads.
    // These are the ones that determine whether the inbox + calendar feel
    // instant on first click.
    const t1 = setTimeout(() => {
      void qc.prefetchQuery({
        queryKey: qk.emailThreads(),
        queryFn: () => emailApi.listThreads({}),
        staleTime: 30_000,
      });
      void qc.prefetchQuery({
        queryKey: qk.calendarEvents(),
        queryFn: () => calendarApi.listEvents({}),
        staleTime: 30_000,
      });
      void qc.prefetchQuery({
        queryKey: qk.connectStatus(),
        queryFn: () => connectApi.status(),
        staleTime: 30_000,
      });
    }, 400);

    // Wave 2 (~1.2s after open): folders + profile-adjacent resources.
    // These keys are now backed by React Query so the panels read from
    // cache instead of re-fetching on mount.
    const t2 = setTimeout(() => {
      void qc.prefetchQuery({
        queryKey: qk.emailDrafts(),
        queryFn: () => emailApi.listDrafts(),
        staleTime: 30_000,
      });
      void qc.prefetchQuery({
        queryKey: qk.emailSent(),
        queryFn: () => emailApi.listSent({}),
        staleTime: 30_000,
      });
      void qc.prefetchQuery({
        queryKey: qk.bookingLinks(),
        queryFn: () => meApi.listBookingLinks(),
        staleTime: 30_000,
      });
      void qc.prefetchQuery({
        queryKey: qk.snippets(),
        queryFn: () => snippetsApi.list(),
        staleTime: 30_000,
      });
    }, 1200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [open, qc]);

  // External trigger from any "Take the tour" button.
  useEffect(() => {
    function handler() {
      setIndex(0);
      setOpen(true);
    }
    window.addEventListener("googenie:tour.open", handler);
    return () => window.removeEventListener("googenie:tour.open", handler);
  }, []);

  const finish = useCallback(() => {
    setOpen(false);
    setIndex(0);
    try {
      window.localStorage.setItem(STORAGE_KEYS.tourCompleted, "1");
    } catch { /* ignore quota */ }
  }, []);

  const advance = useCallback(() => {
    const next = index + 1;
    if (next >= STEPS.length) {
      finish();
      window.dispatchEvent(
        new CustomEvent("googenie:toast", {
          detail: { message: "Tour finished — happy emailing!", icon: "auto_awesome" },
        }),
      );
      return;
    }
    setIndex(next);
    const route = STEPS[next]?.route;
    if (route) {
      try { router.push(route); } catch { /* navigation best-effort */ }
    }
  }, [index, finish, router]);

  const back = useCallback(() => {
    if (index === 0) return;
    setIndex(index - 1);
  }, [index]);

  // Escape closes (counts as Skip).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter") advance();
      else if (e.key === "ArrowLeft") back();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, advance, back, finish]);

  if (!open) return null;
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) finish();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      <div
        className="w-full max-w-lg rounded-3xl p-7"
        style={{
          background: "var(--c-surface-container-low)",
          border: "1px solid var(--glass-border)",
          boxShadow: "var(--glass-shadow)",
        }}
      >
        {/* Header: badge + step indicator */}
        <div className="flex items-center justify-between mb-5">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full"
            style={{
              background: "color-mix(in srgb, var(--c-primary) 12%, transparent)",
              color: "var(--c-primary)",
            }}
          >
            {step.badge}
          </span>
          <span className="text-[11px] font-semibold" style={{ color: "var(--c-on-surface-variant)" }}>
            {index + 1} / {STEPS.length}
          </span>
        </div>

        {/* Icon tile + title */}
        <div className="flex items-start gap-4 mb-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, var(--c-primary), var(--c-tertiary))" }}
          >
            <Icon name={step.icon} className="text-3xl" style={{ color: "var(--c-on-primary)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="tour-title"
              className="font-headline text-2xl leading-tight"
              style={{ color: "var(--c-on-surface)" }}
            >
              {step.title}
            </h2>
          </div>
        </div>

        {/* Body */}
        <p className="text-sm mb-4" style={{ color: "var(--c-on-surface-variant)" }}>
          {step.body}
        </p>

        {/* Optional bullet list */}
        {step.bullets && step.bullets.length > 0 && (
          <ul className="space-y-2 mb-5">
            {step.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--c-on-surface)" }}>
                <Icon
                  name="check_circle"
                  className="text-base mt-0.5 shrink-0"
                  style={{ color: "var(--c-primary)" }}
                />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-5 justify-center">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === index ? 22 : 6,
                background:
                  i === index
                    ? "var(--c-primary)"
                    : i < index
                      ? "color-mix(in srgb, var(--c-primary) 45%, transparent)"
                      : "var(--c-outline-variant)",
              }}
            />
          ))}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={finish}
            className="text-sm px-3 py-2 rounded-full"
            style={{ color: "var(--c-on-surface-variant)" }}
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button onClick={back} className="btn-secondary text-sm">
                Back
              </button>
            )}
            <button
              onClick={advance}
              className="px-5 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5"
              style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}
            >
              {isLast ? "Finish" : "Next"}
              <Icon name={isLast ? "check" : "arrow_forward"} className="text-base" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
