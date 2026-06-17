"use client";

/**
 * Landing Page — Superhuman-inspired marketing surface.
 *
 * Design DNA borrowed from superhuman.com:
 *   - Heroic display typography (Space Grotesk)
 *   - Generous whitespace, dark-tinted hero
 *   - Suite-style product grid (4 cards: Inbox, Calendar, AI Productivity, Team)
 *   - Per-product deep-dive sections with alternating layouts
 *   - Manifesto block
 *   - Final centred CTA
 *
 * Content is 100% GooGenie:
 *   - All 24 features pulled from FEATURE_CATALOG with INCLUDED / PREMIUM tags
 *   - Mock inbox previews show real product UI (reply-needed urgency, OOO
 *     banner, daily digest summary)
 *   - Tier story (10 Basic free + 14 Premium request-gated) is a core narrative
 */

import Link from "next/link";
import { useNavigate } from "../lib/router-shim";
import { useEffect, useState } from "react";
import { useAuth as useClerkAuth } from "@clerk/nextjs";
import { useTheme } from "../contexts/ThemeContext";
import { Icon } from "../components/Icon";
import {
  FEATURE_CATALOG,
  type FeatureCatalogEntry,
} from "../../app/api/v1/me/_catalog";

// ─── Shared design tokens ─────────────────────────────────────────────────
//
// Inline styles instead of Tailwind classes so the landing page renders
// ─── Theme-aware palette ──────────────────────────────────────────────────
//
// We render the marketing page with inline styles (rather than CSS vars) so the
// design renders identically in any context. To support light/dark we ship two
// hand-tuned palettes and pick one per render via the existing useTheme() hook.
//
// Note: this is independent of the app shell's CSS-var theme — the landing
// page intentionally uses its own warm cream / near-black aesthetic.

interface Palette {
  ink: string;
  surface: string;
  surfaceAlt: string;
  card: string;
  border: string;
  borderSoft: string;
  primary: string;
  primaryInk: string;
  accent: string;
  accentSoft: string;
  muted: string;
  dark: string;
  darkInk: string;
  darkPanel: string;
}

const LIGHT_PALETTE: Palette = {
  ink: "#0F1115",       // near-black for text
  surface: "#F7F6F2",   // cream background (warm off-white)
  surfaceAlt: "#EDE9E0",
  card: "#FFFFFF",
  border: "#E5E0D6",
  borderSoft: "rgba(15,17,21,0.08)",
  primary: "#0F1115",   // monochrome CTA like Superhuman's black buttons
  primaryInk: "#FFFFFF",
  accent: "#E94B35",    // brand pop (Superhuman uses warm orange-red)
  accentSoft: "#FFEDE8",
  muted: "#6B7280",
  dark: "#0A0B0E",
  darkInk: "#F2EFE7",
  darkPanel: "#15171C",
};

const DARK_PALETTE: Palette = {
  ink: "#F2EFE7",                          // primary text on dark
  surface: "#0A0B0E",                      // page background — true dark
  surfaceAlt: "#111317",                   // alternating section background
  card: "#15171C",                         // card surface (slightly lighter than page)
  border: "rgba(255,255,255,0.08)",        // subtle borders
  borderSoft: "rgba(255,255,255,0.05)",
  primary: "#F2EFE7",                      // CTA buttons in dark mode invert
  primaryInk: "#0F1115",                   //   ink on those CTAs goes black
  accent: "#FF6B52",                       // slightly brighter accent for dark
  accentSoft: "rgba(255,107,82,0.14)",
  muted: "#9CA3AF",
  // The "dark" sections in the light theme are already dark — in dark theme we
  // keep them dark too but raise to a "deeper black" so they still stand out.
  dark: "#000000",
  darkInk: "#F2EFE7",
  darkPanel: "#0A0B0E",
};

const FONT_DISPLAY = "'Space Grotesk', system-ui, -apple-system, sans-serif";
const FONT_BODY = "'Inter', system-ui, -apple-system, sans-serif";

// ─── Helper components ────────────────────────────────────────────────────

function Pill({
  children,
  tone = "neutral",
  p,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "included" | "premium";
  p: Palette;
}) {
  const styles: Record<string, React.CSSProperties> = {
    neutral:  { background: "rgba(127,127,127,0.10)", color: p.ink, border: `1px solid ${p.borderSoft}` },
    included: { background: "rgba(27,111,61,0.14)",   color: "#4ED68B", border: "1px solid rgba(78,214,139,0.35)" },
    premium:  { background: p.accentSoft,             color: p.accent, border: `1px solid ${p.accent}33` },
  };
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-widest"
      style={styles[tone]}
    >
      {children}
    </span>
  );
}

function FeatureLine({ f, p }: { f: FeatureCatalogEntry; p: Palette }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{
          background: f.tier === "addon" ? p.accentSoft : "rgba(127,127,127,0.08)",
          color: f.tier === "addon" ? p.accent : p.ink,
        }}
      >
        <Icon name={f.icon} className="text-[18px]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-[14px]" style={{ color: p.ink }}>
            {f.label}
          </span>
          <Pill p={p} tone={f.tier === "addon" ? "premium" : "included"}>
            {f.tier === "addon" ? "Premium" : "Included"}
          </Pill>
        </div>
        {f.description && (
          <p className="text-[13px] leading-snug mt-0.5" style={{ color: p.muted }}>
            {f.description}
          </p>
        )}
      </div>
    </li>
  );
}

/** Section heading group — small uppercase eyebrow + big display headline. */
function SectionHead({
  eyebrow,
  title,
  subtitle,
  dark = false,
  p,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  dark?: boolean;
  p: Palette;
}) {
  // When `dark` is true we always render on a dark surface (regardless of the
  // overall theme), so use the fixed dark-on-dark palette.
  const inkColor = dark ? p.darkInk : p.ink;
  const mutedColor = dark ? "rgba(242,239,231,0.7)" : p.muted;
  return (
    <div className="max-w-3xl">
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-4"
        style={{ color: p.accent }}
      >
        {eyebrow}
      </p>
      <h2
        className="text-[40px] md:text-[56px] leading-[1.05] tracking-tight font-semibold mb-5"
        style={{ fontFamily: FONT_DISPLAY, color: inkColor }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="text-[17px] leading-[1.55]" style={{ color: mutedColor, maxWidth: "60ch" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

// ─── The page ─────────────────────────────────────────────────────────────

export function LandingPage() {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Pick a palette based on the current theme. Re-renders automatically when
  // the user toggles light/dark via the nav icon.
  const p: Palette = theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;

  useEffect(() => {
    if (isLoaded && isSignedIn) navigate("/inbox", { replace: true });
  }, [isLoaded, isSignedIn, navigate]);

  // Bucket the catalog by group for the per-product sections.
  const byGroup = (group: string) => FEATURE_CATALOG.filter((f) => f.group === group);
  const inboxFeatures = byGroup("Email AI");
  const calendarFeatures = byGroup("Calendar AI");
  const productivityFeatures = byGroup("Productivity");
  const coreFeatures = byGroup("Core");

  const basicCount = FEATURE_CATALOG.filter((f) => f.tier === "basic").length;
  const premiumCount = FEATURE_CATALOG.filter((f) => f.tier === "addon").length;

  return (
    <div
      className="min-h-screen"
      style={{
        background: p.surface,
        color: p.ink,
        fontFamily: FONT_BODY,
        fontFeatureSettings: '"cv02","cv03","cv04","cv11"',
      }}
    >
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 backdrop-blur-md"
        style={{
          // Same colour as the page body at 85% opacity so the blur reads
          // correctly in both themes (cream in light, deep black in dark).
          background: theme === "dark" ? "rgba(10,11,14,0.85)" : "rgba(247,246,242,0.85)",
          borderBottom: `1px solid ${p.borderSoft}`,
        }}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: p.accent }}
            >
              <Icon name="auto_awesome" className="text-base" style={{ color: "#ffffff" }} />
            </div>
            <span
              className="text-[20px] font-semibold tracking-tight"
              style={{ fontFamily: FONT_DISPLAY, color: p.ink }}
            >
              GooGenie
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-[14px]" style={{ color: p.ink }}>
            <a href="#inbox" className="hover:opacity-60 transition-opacity">Inbox</a>
            <a href="#calendar" className="hover:opacity-60 transition-opacity">Calendar</a>
            <a href="#productivity" className="hover:opacity-60 transition-opacity">AI Tools</a>
            <a href="#tiers" className="hover:opacity-60 transition-opacity">Plans</a>
            <a href="#faq" className="hover:opacity-60 transition-opacity">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="p-2 rounded-md transition-colors hover:bg-black/5"
              title="Toggle theme"
            >
              <Icon name={theme === "dark" ? "light_mode" : "dark_mode"} className="text-[20px]" />
            </button>
            <Link
              href="/login"
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[14px]"
              style={{ color: p.ink }}
            >
              Log in
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[14px] font-semibold transition-transform hover:scale-[1.02]"
              style={{ background: p.ink, color: p.primaryInk }}
            >
              Get GooGenie
              <Icon name="arrow_forward" className="text-[16px]" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 pt-20 pb-24 md:pt-28 md:pb-32 text-center">
          <p
            className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.2em] mb-6"
            style={{ color: p.accent }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.accent }} />
            Built on Corsair · Powered by Mistral
          </p>
          <h1
            className="text-[56px] sm:text-[80px] md:text-[112px] leading-[0.95] tracking-[-0.03em] font-semibold mb-8"
            style={{ fontFamily: FONT_DISPLAY, color: p.ink }}
          >
            Email at the
            <br />
            <span style={{ color: p.accent }}>speed of thought.</span>
          </h1>
          <p
            className="text-[18px] md:text-[20px] leading-[1.55] mx-auto mb-10"
            style={{ color: p.muted, maxWidth: "44ch" }}
          >
            GooGenie is the AI-native Gmail &amp; Calendar workspace built for teams.
            Triage in seconds, schedule with one click, never drop a follow-up.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-14">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-md text-[15px] font-semibold transition-transform hover:scale-[1.02]"
              style={{ background: p.ink, color: p.primaryInk }}
            >
              Get GooGenie free
              <Icon name="arrow_forward" className="text-[18px]" />
            </Link>
            <a
              href="#inbox"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-md text-[15px] font-semibold transition-colors"
              style={{ border: `1px solid ${p.border}`, color: p.ink }}
            >
              See what's inside
            </a>
          </div>

          {/* Product preview — fake browser frame with stacked panels */}
          <div className="max-w-5xl mx-auto">
            <div
              className="rounded-2xl overflow-hidden shadow-2xl"
              style={{ background: p.dark, border: `1px solid ${p.darkPanel}` }}
            >
              <div className="flex items-center gap-2 px-4 py-3" style={{ background: p.darkPanel }}>
                <div className="flex gap-1.5">
                  <span className="w-3 h-3 rounded-full" style={{ background: "#FF5F57" }} />
                  <span className="w-3 h-3 rounded-full" style={{ background: "#FEBC2E" }} />
                  <span className="w-3 h-3 rounded-full" style={{ background: "#28C840" }} />
                </div>
                <div
                  className="ml-4 px-3 py-1 rounded text-[11px] font-mono"
                  style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
                >
                  app.googenie.ai/inbox
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-0">
                {/* Thread list mock */}
                <div className="md:col-span-2 p-5" style={{ background: p.dark, borderRight: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Icon name="inbox" className="text-[18px]" style={{ color: p.darkInk }} />
                    <span className="text-[14px] font-semibold" style={{ color: p.darkInk }}>Inbox</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: p.accent, color: "white" }}
                    >
                      3
                    </span>
                  </div>
                  {[
                    { from: "Priya", subj: "Q4 budget — need approval", urgent: true, badge: "REPLY NEEDED" },
                    { from: "GitHub", subj: "PR #128 merged", urgent: false, badge: null },
                    { from: "Calendly", subj: "Meeting with Alex tomorrow", urgent: false, badge: "AUTO-CATEGORIZED" },
                  ].map((m, i) => (
                    <div
                      key={i}
                      className="px-3 py-2.5 rounded-md mb-1.5"
                      style={{
                        background: i === 0 ? "rgba(233,75,53,0.08)" : "transparent",
                        borderLeft: i === 0 ? `2px solid ${p.accent}` : "2px solid transparent",
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold" style={{ color: p.darkInk }}>{m.from}</span>
                        {m.badge && (
                          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: m.urgent ? p.accent : "rgba(255,255,255,0.4)" }}>
                            {m.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] truncate mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>{m.subj}</p>
                    </div>
                  ))}
                </div>
                {/* Reading pane mock */}
                <div className="md:col-span-3 p-6" style={{ background: p.dark }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Pill p={p} tone="premium">Premium</Pill>
                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>Daily Digest</span>
                  </div>
                  <p className="text-[14px] leading-[1.6]" style={{ color: p.darkInk }}>
                    Good morning, Raj. You have <strong>3 emails awaiting a reply</strong> (Priya's Q4 budget is most urgent),
                    <strong> 2 meetings starting in 2h</strong>, and a <strong>90-min gap at 10 AM</strong> — perfect for catching up.
                  </p>
                  <div className="mt-5 pt-5 grid grid-cols-3 gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    {[
                      { icon: "hourglass", label: "Reply", val: "3" },
                      { icon: "event", label: "Meetings", val: "2" },
                      { icon: "task_alt", label: "Tasks", val: "5" },
                    ].map((s) => (
                      <div key={s.label} className="text-center">
                        <Icon name={s.icon} className="text-[20px]" style={{ color: p.accent }} />
                        <p className="text-[22px] font-semibold leading-none mt-1" style={{ fontFamily: FONT_DISPLAY, color: p.darkInk }}>{s.val}</p>
                        <p className="text-[10px] uppercase tracking-wider mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Built-on strip ──────────────────────────────────────────────── */}
      <section className="py-12 border-y" style={{ borderColor: p.borderSoft }}>
        <div className="max-w-6xl mx-auto px-6">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.2em] text-center mb-6"
            style={{ color: p.muted }}
          >
            Engineered with best-in-class infrastructure
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {[
              { name: "Corsair", desc: "OAuth + Gmail/Calendar cache" },
              { name: "Mistral AI", desc: "European AI inference" },
              { name: "Clerk", desc: "JWT auth" },
              { name: "Next.js 15", desc: "Server-first" },
              { name: "Postgres", desc: "pgvector embeddings" },
              { name: "Drizzle ORM", desc: "Type-safe queries" },
            ].map((t) => (
              <div key={t.name} className="text-center">
                <p className="text-[15px] font-semibold tracking-tight" style={{ color: p.ink, fontFamily: FONT_DISPLAY }}>
                  {t.name}
                </p>
                <p className="text-[11px]" style={{ color: p.muted }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product suite (4 cards) ────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-24 md:py-32">
        <div className="text-center mb-16">
          <SectionHead
            eyebrow="The Suite"
            title="One workspace. Four superpowers."
            subtitle="GooGenie groups every capability into four product surfaces — the moment you sign in, your inbox already knows what matters." p={p}
          />
          {/* Center the SectionHead */}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { icon: "inbox", label: "Inbox", desc: "Triage, sender insights, OOO detection, newsletter cleanup", href: "#inbox", color: "#4F46E5" },
            { icon: "event_available", label: "Calendar", desc: "AI briefs, smart reschedule, schedule-from-email, gap finder", href: "#calendar", color: "#0EA5E9" },
            { icon: "auto_awesome", label: "AI Tools", desc: "Task extractor, inline commands, daily digest, schedule send", href: "#productivity", color: "#F59E0B" },
            { icon: "shield_person", label: "Team Controls", desc: "RBAC, feature requests, audit log, manager grants", href: "#tiers", color: "#10B981" },
          ].map((card) => (
            <a
              key={card.label}
              href={card.href}
              className="rounded-2xl p-6 flex flex-col gap-4 transition-transform hover:-translate-y-1"
              style={{
                background: p.card,
                border: `1px solid ${p.border}`,
                boxShadow: theme === "dark" ? "0 1px 3px rgba(0,0,0,0.4)" : "0 1px 3px rgba(15,17,21,0.04)",
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: `${card.color}22`, color: card.color }}
              >
                <Icon name={card.icon} className="text-[24px]" />
              </div>
              <div>
                <h3 className="text-[22px] font-semibold tracking-tight mb-1.5" style={{ fontFamily: FONT_DISPLAY, color: p.ink }}>
                  {card.label}
                </h3>
                <p className="text-[14px] leading-snug" style={{ color: p.muted }}>
                  {card.desc}
                </p>
              </div>
              <span className="flex items-center gap-1 text-[13px] font-semibold mt-auto" style={{ color: p.ink }}>
                Explore <Icon name="arrow_forward" className="text-[16px]" />
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* ── INBOX deep dive ────────────────────────────────────────────── */}
      <section id="inbox" className="py-24 md:py-32" style={{ background: p.surfaceAlt }}>
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-14 items-start">
          <div className="lg:sticky lg:top-24">
            <SectionHead
              eyebrow="Inbox"
              title="The fastest way through your day."
              subtitle="Reply-needed triage surfaces only the threads that owe a response. Sender Insights show how fast you and they typically reply. OOO detection turns dead-ends into scheduled follow-ups. All without burning a single AI token." p={p}
            />
            <div className="flex items-center gap-3 mt-8">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-[14px] font-semibold"
                style={{ background: p.ink, color: p.primaryInk }}
              >
                Try Inbox free
                <Icon name="arrow_forward" className="text-[16px]" />
              </Link>
              <span className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "#1B6F3D" }}>
                ✓ 5 features included
              </span>
            </div>
          </div>
          <ul className="divide-y" style={{ background: p.card, borderRadius: "1rem", border: `1px solid ${p.border}`, padding: "0 1.25rem" }}>
            {inboxFeatures.map((f) => (
              <FeatureLine key={f.key} f={f} p={p} />
            ))}
          </ul>
        </div>
      </section>

      {/* ── CALENDAR deep dive ─────────────────────────────────────────── */}
      <section id="calendar" className="py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-14 items-start">
          <ul className="lg:order-2 divide-y" style={{ background: p.card, borderRadius: "1rem", border: `1px solid ${p.border}`, padding: "0 1.25rem" }}>
            {calendarFeatures.map((f) => (
              <FeatureLine key={f.key} f={f} p={p} />
            ))}
          </ul>
          <div className="lg:order-1 lg:sticky lg:top-24">
            <SectionHead
              eyebrow="Calendar"
              title="Meetings that schedule themselves."
              subtitle="Drop the back-and-forth. Schedule-from-Email reads the proposal in your thread, checks your free/busy, and books in one click. AI briefs pull every relevant email with each attendee 30 min before the call. Smart Reschedule resolves conflicts before they happen." p={p}
            />
            <div className="flex items-center gap-3 mt-8">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-[14px] font-semibold"
                style={{ background: p.ink, color: p.primaryInk }}
              >
                Connect Calendar
                <Icon name="arrow_forward" className="text-[16px]" />
              </Link>
              <span className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: p.accent }}>
                4 premium · 1 included
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── AI PRODUCTIVITY deep dive ──────────────────────────────────── */}
      <section id="productivity" className="py-24 md:py-32" style={{ background: p.dark, color: p.darkInk }}>
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-14 items-start">
          <div className="lg:sticky lg:top-24">
            <SectionHead
              eyebrow="AI Productivity"
              title="Type / for instant magic."
              subtitle="Inline slash commands rewrite your draft in place. The Task Extractor mines every inbox sweep for action items. Schedule Send queues an email for the perfect moment. Daily Digest gives you a warm one-paragraph briefing every morning."
              dark p={p}
            />
            <div className="flex items-center gap-3 mt-8">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-[14px] font-semibold transition-transform hover:scale-[1.02]"
                style={{ background: p.accent, color: "white" }}
              >
                Activate AI Tools
                <Icon name="arrow_forward" className="text-[16px]" />
              </Link>
              <span className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "rgba(242,239,231,0.6)" }}>
                3 premium · 2 included
              </span>
            </div>

            {/* Mock /improve command */}
            <div
              className="mt-10 rounded-xl p-5 font-mono text-[13px] leading-relaxed"
              style={{ background: p.darkPanel, border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)" }}
            >
              <p style={{ color: "rgba(255,255,255,0.45)" }}>compose</p>
              <p className="mt-2">hey can u send me the file thx</p>
              <p className="mt-1" style={{ color: p.accent }}>/improve <span style={{ color: "rgba(255,255,255,0.4)" }}>↹</span></p>
              <p className="mt-3 px-3 py-2 rounded-md" style={{ background: "rgba(233,75,53,0.1)", color: p.darkInk }}>
                Hi — could you please share the file at your earliest convenience? Thank you!
              </p>
            </div>
          </div>

          {/* Card list, dark variant */}
          <div
            className="divide-y"
            style={{ background: p.darkPanel, borderRadius: "1rem", border: "1px solid rgba(255,255,255,0.08)", padding: "0 1.25rem" }}
          >
            {productivityFeatures.map((f) => (
              <li key={f.key} className="flex items-start gap-3 py-3 list-none">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    background: f.tier === "addon" ? "rgba(233,75,53,0.15)" : "rgba(255,255,255,0.06)",
                    color: f.tier === "addon" ? p.accent : p.darkInk,
                  }}
                >
                  <Icon name={f.icon} className="text-[18px]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[14px]" style={{ color: p.darkInk }}>{f.label}</span>
                    {f.tier === "addon" ? (
                      <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: p.accent, color: "white" }}>Premium</span>
                    ) : (
                      <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)", color: p.darkInk }}>Included</span>
                    )}
                  </div>
                  {f.description && (
                    <p className="text-[13px] leading-snug mt-0.5" style={{ color: "rgba(242,239,231,0.65)" }}>{f.description}</p>
                  )}
                </div>
              </li>
            ))}
          </div>
        </div>
      </section>

      {/* ── TIER STORY / PLANS ─────────────────────────────────────────── */}
      <section id="tiers" className="py-24 md:py-32">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14 flex flex-col items-center">
            <SectionHead
              eyebrow="Pricing philosophy"
              title="Free where it should be. Paid where it matters."
              subtitle="Local-only features that don't burn AI tokens are free for everyone. Token-billed features sit behind a simple request → grant flow. Your manager decides; you don't surprise the bill." p={p}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* Included tier */}
            <div
              className="rounded-2xl p-8 flex flex-col"
              style={{ background: p.card, border: `1px solid ${p.border}` }}
            >
              <div className="flex items-center gap-3 mb-2">
                <Pill p={p} tone="included">Included</Pill>
                <span className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: p.muted }}>
                  Free forever
                </span>
              </div>
              <h3 className="text-[42px] font-semibold tracking-tight leading-none mt-3 mb-1" style={{ fontFamily: FONT_DISPLAY, color: p.ink }}>
                $0
                <span className="text-[16px] font-normal" style={{ color: p.muted }}> /user / month</span>
              </h3>
              <p className="text-[14px] mb-6" style={{ color: p.muted }}>
                {basicCount} basic features auto-enabled on signup. No request, no approval, no token meter.
              </p>
              <ul className="space-y-2 mb-6 text-[13.5px]" style={{ color: p.ink }}>
                {FEATURE_CATALOG.filter((f) => f.tier === "basic").map((f) => (
                  <li key={f.key} className="flex items-center gap-2">
                    <Icon name="check" className="text-[16px]" style={{ color: "#1B6F3D" }} />
                    {f.label}
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className="mt-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-[14px] font-semibold"
                style={{ border: `1px solid ${p.border}`, color: p.ink }}
              >
                Get started
                <Icon name="arrow_forward" className="text-[16px]" />
              </Link>
            </div>

            {/* Premium tier */}
            <div
              className="rounded-2xl p-8 flex flex-col relative"
              style={{ background: p.dark, border: `1px solid ${p.dark}`, color: p.darkInk }}
            >
              <span
                className="absolute -top-3 right-6 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
                style={{ background: p.accent, color: "white" }}
              >
                Most popular
              </span>
              <div className="flex items-center gap-3 mb-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-widest" style={{ background: p.accent, color: "white" }}>Premium</span>
                <span className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "rgba(242,239,231,0.55)" }}>
                  Pay-as-you-go
                </span>
              </div>
              <h3 className="text-[42px] font-semibold tracking-tight leading-none mt-3 mb-1" style={{ fontFamily: FONT_DISPLAY, color: p.darkInk }}>
                $9
                <span className="text-[16px] font-normal" style={{ color: "rgba(242,239,231,0.55)" }}> /user / month</span>
              </h3>
              <p className="text-[14px] mb-6" style={{ color: "rgba(242,239,231,0.75)" }}>
                Unlock all {premiumCount} AI-powered features. Each request from a user goes to a manager for approval — no surprises.
              </p>
              <ul className="space-y-2 mb-6 text-[13.5px]">
                {FEATURE_CATALOG.filter((f) => f.tier === "addon").slice(0, 8).map((f) => (
                  <li key={f.key} className="flex items-center gap-2" style={{ color: p.darkInk }}>
                    <Icon name="check" className="text-[16px]" style={{ color: p.accent }} />
                    {f.label}
                  </li>
                ))}
                <li className="text-[12px] italic" style={{ color: "rgba(242,239,231,0.5)" }}>
                  + {premiumCount - 8} more premium capabilities
                </li>
              </ul>
              <Link
                href="/login"
                className="mt-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-[14px] font-semibold transition-transform hover:scale-[1.02]"
                style={{ background: p.accent, color: "white" }}
              >
                Try premium free
                <Icon name="arrow_forward" className="text-[16px]" />
              </Link>
            </div>
          </div>

          {/* Core features matrix */}
          <div className="max-w-5xl mx-auto mt-14">
            <p className="text-[12px] font-semibold uppercase tracking-widest text-center mb-4" style={{ color: p.muted }}>
              Core access (read your inbox + calendar without any AI)
            </p>
            <ul className="grid grid-cols-2 md:grid-cols-3 gap-3" style={{ color: p.ink }}>
              {coreFeatures.map((f) => (
                <li
                  key={f.key}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px]"
                  style={{ background: p.card, border: `1px solid ${p.border}` }}
                >
                  <Icon name={f.icon} className="text-[16px]" style={{ color: p.muted }} />
                  {f.label}
                  <span className="ml-auto">
                    <Pill p={p} tone={f.tier === "addon" ? "premium" : "included"}>
                      {f.tier === "addon" ? "Premium" : "Included"}
                    </Pill>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Manifesto ──────────────────────────────────────────────────── */}
      <section className="py-24 md:py-32" style={{ background: p.ink, color: p.darkInk }}>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.2em] mb-6"
            style={{ color: p.accent }}
          >
            Becoming GooGenie
          </p>
          <h2
            className="text-[36px] md:text-[56px] leading-[1.1] tracking-tight font-semibold mb-8"
            style={{ fontFamily: FONT_DISPLAY }}
          >
            AI that earns its keep — and never spends your tokens without permission.
          </h2>
          <p className="text-[18px] leading-[1.65] max-w-2xl mx-auto" style={{ color: "rgba(242,239,231,0.75)" }}>
            We split GooGenie into two halves on purpose. The local half — triage,
            insights, follow-ups, gap-finding — is yours forever, no token meter.
            The AI half — drafts, briefs, classifiers, digests — is gated by a
            simple manager-approval flow. Your team controls what fires. You stay
            in the loop. Your bill stays sane.
          </p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3 text-[13px]">
            <span className="px-4 py-2 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
              ✓ {basicCount} features free
            </span>
            <span className="px-4 py-2 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
              ✓ Per-user feature requests
            </span>
            <span className="px-4 py-2 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
              ✓ Full audit trail
            </span>
            <span className="px-4 py-2 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
              ✓ Tenant-scoped OAuth (KEK-encrypted)
            </span>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-24 md:py-32">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12 flex flex-col items-center">
            <SectionHead eyebrow="FAQ" title="Questions, answered." p={p} />
          </div>
          <div className="space-y-3">
            {[
              { q: "How does the request flow work?", a: "When a user wants a premium feature, they click Request in their profile. The request lands in their manager's inbox with a chime + notification. The manager can approve or deny in one click; the toggle flips immediately via SSE." },
              { q: "What does 'basic' actually mean?", a: "Basic features run entirely on local SQL queries against Corsair's cached Gmail/Calendar data. Zero AI tokens are spent. Sender Insights, Reply-Needed Triage, OOO Detection, Follow-up Tracker, Newsletter Cleanup, Calendar Gap Filler, Split-View Inbox, and Schedule Send are all free, forever." },
              { q: "Where does my email data live?", a: "Your Gmail and Calendar OAuth tokens are encrypted per-tenant using AES-256 (Corsair KEK). Message bodies are cached locally in Corsair's SQLite store for low-latency queries — never sent to any third-party AI service unless a premium feature explicitly requires it." },
              { q: "Can I disable premium features for my team?", a: "Yes. Managers see a tiered toggle grid for every user — premium features are marked with a $ badge so you know which ones spend tokens. Bulk-action lets you turn a feature on/off for an entire team in one click." },
              { q: "What if I don't have a Mistral key?", a: "GooGenie degrades gracefully. Premium features fall back to deterministic regex/heuristic logic, so basic functionality keeps working. The Daily Digest, for instance, becomes a structured list instead of a narrative paragraph." },
              { q: "Is there a keyboard shortcut for everything?", a: "Yes. ⌘K opens the command palette. j/k navigates the inbox vim-style. Shift+S toggles split/stacked layout. Every shortcut is re-bindable via Profile → Shortcuts." },
            ].map((f, i) => (
              <button
                key={i}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full text-left rounded-xl overflow-hidden transition-all"
                style={{
                  background: openFaq === i ? p.card : p.card,
                  border: `1px solid ${p.border}`,
                }}
              >
                <div className="flex items-start justify-between gap-4 px-6 py-5">
                  <span className="text-[15px] font-semibold" style={{ color: p.ink }}>{f.q}</span>
                  <Icon
                    name="add"
                    className="text-[20px] transition-transform shrink-0 mt-0.5"
                    style={{ color: p.ink, transform: openFaq === i ? "rotate(45deg)" : "rotate(0deg)" }}
                  />
                </div>
                {openFaq === i && (
                  <div className="px-6 pb-5">
                    <p className="text-[14px] leading-[1.6]" style={{ color: p.muted }}>{f.a}</p>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section className="py-24 md:py-32" style={{ background: p.surfaceAlt }}>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2
            className="text-[48px] md:text-[80px] leading-[0.98] tracking-[-0.02em] font-semibold mb-8"
            style={{ fontFamily: FONT_DISPLAY, color: p.ink }}
          >
            Stop managing email.
            <br />
            <span style={{ color: p.accent }}>Start finishing it.</span>
          </h2>
          <p className="text-[18px] mb-10" style={{ color: p.muted, maxWidth: "44ch", margin: "0 auto 2.5rem" }}>
            Sign in with Google, connect your account, and your real inbox loads in under a minute.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-md text-[16px] font-semibold transition-transform hover:scale-[1.02]"
            style={{ background: p.ink, color: p.primaryInk }}
          >
            Get GooGenie free
            <Icon name="arrow_forward" className="text-[20px]" />
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer
        className="py-10 border-t"
        style={{ borderColor: p.borderSoft, color: p.muted }}
      >
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-[13px]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: p.accent }}>
              <Icon name="auto_awesome" className="text-[12px]" style={{ color: "#ffffff" }} />
            </div>
            <span className="font-semibold tracking-tight" style={{ color: p.ink, fontFamily: FONT_DISPLAY }}>GooGenie</span>
            <span>· AI-first email + calendar workspace</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="#inbox" className="hover:opacity-60">Inbox</a>
            <a href="#calendar" className="hover:opacity-60">Calendar</a>
            <a href="#productivity" className="hover:opacity-60">AI Tools</a>
            <a href="#tiers" className="hover:opacity-60">Plans</a>
            <Link href="/login" className="font-semibold" style={{ color: p.ink }}>Log in →</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
