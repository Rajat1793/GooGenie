"use client";

import Link from "next/link";
import { useNavigate } from "../lib/router-shim";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth as useClerkAuth } from "@clerk/nextjs";
import { useTheme } from "../contexts/ThemeContext";
import { Icon } from "../components/Icon";

const PLANS = [
  {
    name: "Learner",
    price: 0,
    period: null as string | null,
    description: "Perfect for individuals exploring GooGenie. No credit card required.",
    color: "bg-secondary-container text-secondary",
    iconColor: "text-secondary",
    icon: "school",
    highlighted: false,
    cta: "Get started free",
    ctaHref: "/login",
    badge: null as string | null,
    features: [
      { text: "Personal Gmail inbox (read & send)", included: true },
      { text: "Google Calendar view", included: true },
      { text: "HTML email rendering", included: true },
      { text: "Gmail category tabs", included: true },
      { text: "Up to 50 emails / day", included: true },
      { text: "Google Meet in events", included: false },
      { text: "Team hierarchy (Org Tree)", included: false },
      { text: "Manager-level views", included: false },
      { text: "Audit trail", included: false },
      { text: "Webhook real-time push", included: false },
    ],
  },
  {
    name: "Startup",
    price: 199,
    period: "/ month",
    description: "For growing teams that need collaboration, role-based access, and real-time sync.",
    color: "bg-primary-container text-primary",
    iconColor: "text-primary",
    icon: "rocket_launch",
    highlighted: true,
    cta: "Start 14-day trial",
    ctaHref: "/login",
    badge: "Most popular",
    features: [
      { text: "Everything in Learner", included: true },
      { text: "Unlimited emails", included: true },
      { text: "Up to 25 team members", included: true },
      { text: "Google Meet in events", included: true },
      { text: "Team hierarchy (Org Tree)", included: true },
      { text: "Manager-level views", included: true },
      { text: "Audit trail (30-day retention)", included: true },
      { text: "Webhook real-time push", included: true },
      { text: "Role-based access control", included: true },
      { text: "Priority email support", included: true },
    ],
  },
  {
    name: "Enterprise",
    price: null as number | null,
    period: null as string | null,
    description: "Tailored for large orgs with custom integrations, SLAs, and a dedicated account manager.",
    color: "bg-error-container text-error",
    iconColor: "text-error",
    icon: "domain",
    highlighted: false,
    cta: "Contact sales",
    ctaHref: "mailto:sales@googenie.ai",
    badge: null as string | null,
    features: [
      { text: "Everything in Startup", included: true },
      { text: "Unlimited team members", included: true },
      { text: "Custom OAuth & SSO", included: true },
      { text: "Dedicated infrastructure", included: true },
      { text: "Unlimited audit retention", included: true },
      { text: "Custom role definitions", included: true },
      { text: "SLA guarantee (99.9% uptime)", included: true },
      { text: "Onboarding & training sessions", included: true },
      { text: "Dedicated account manager", included: true },
      { text: "Custom integrations on request", included: true },
    ],
  },
];

const FAQS = [
  { q: "Is the Learner plan really free forever?", a: "Yes — no credit card, no trial expiry. Permanently free for individuals with a single Google account." },
  { q: "What counts as a 'team member' in Startup?", a: "Any user invited to your GooGenie workspace. Managers and admins each count as one seat." },
  { q: "Can I switch plans at any time?", a: "Absolutely. Upgrades take effect immediately; downgrades apply at the next billing cycle." },
  { q: "Do you offer annual billing?", a: "Yes — pay annually and get 2 months free (17% off). Contact us to switch." },
  { q: "Is my Google data safe?", a: "Yes. OAuth tokens are encrypted at rest per-tenant using AES-256 (Corsair KEK). We never store email content — all reads are live from the Gmail API." },
];

const FEATURES = [
  {
    icon: "mail",
    title: "Unified Inbox",
    desc: "Read, send, and reply to Gmail threads with full label and archive support — all from one keyboard-first interface."
  },
  {
    icon: "calendar_month",
    title: "Smart Calendar",
    desc: "Create events, check team availability, and update schedules via natural language. Google Calendar, fully wired."
  },
  {
    icon: "shield_person",
    title: "Role-Based Access",
    desc: "Three-tier RBAC: super_admin, manager, and user. Each role sees exactly what they need — nothing more."
  },
  {
    icon: "hub",
    title: "Multi-Tenant",
    desc: "Every user connects their own Google account. OAuth tokens are encrypted per-tenant with Corsair's KEK."
  },
  {
    icon: "history",
    title: "Audit Trail",
    desc: "Every action — email send, calendar event, role change — is logged with actor, timestamp, and metadata."
  },
  {
    icon: "bolt",
    title: "Webhook Real-time",
    desc: "Gmail and Calendar push notifications via Pub/Sub. New emails and event changes surface instantly."
  }
];

const STEPS = [
  { icon: "login", label: "Sign in with Google", desc: "One-click Clerk authentication — no passwords." },
  { icon: "add_link", label: "Connect your account", desc: "Authorise Gmail and Calendar with a single popup." },
  { icon: "check_circle", label: "Start working", desc: "Read, send, schedule — from a single glass-panel workspace." }
];

const ROLES = [
  {
    role: "super_admin",
    color: "bg-error-container text-error",
    icon: "admin_panel_settings",
    perks: ["Full user management", "Role & manager assignment", "Complete audit log export", "Platform-wide metrics"]
  },
  {
    role: "manager",
    color: "bg-primary-container text-primary",
    icon: "manage_accounts",
    perks: ["View direct-report inbox", "Toggle feature flags per user", "Team activity feed", "Bulk actions"]
  },
  {
    role: "user",
    color: "bg-secondary-container text-secondary",
    icon: "person",
    perks: ["Personal Gmail inbox", "Google Calendar", "Compose & reply", "Availability check"]
  }
];

export function LandingPage() {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    if (isLoaded && isSignedIn) navigate("/inbox", { replace: true });
  }, [isLoaded, isSignedIn, navigate]);

  return (
    <div className="min-h-screen overflow-x-hidden">

      {/* ── Nav ───────────────────────────────────────────────────── */}
      <header className="glass-header sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <Icon name="cloud" className="text-white text-base" />
            </div>
            <span className="font-headline text-xl text-ink-text tracking-tight">GooGenie</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-on-surface-variant">
            <a href="#features" className="hover:text-ink-text transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-ink-text transition-colors">How it works</a>
            <a href="#roles" className="hover:text-ink-text transition-colors">Roles</a>
            <a href="#pricing" className="hover:text-ink-text transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={toggle} className="btn-ghost p-2" title="Toggle theme">
              <Icon name={theme === "dark" ? "light_mode" : "dark_mode"} className="text-xl" />
            </button>
          <Link href="/login" className="btn-primary text-sm">
            Sign in
            <Icon name="arrow_forward" className="text-base" />
          </Link>          </div>        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        {/* Background blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute top-32 left-10 w-72 h-72 rounded-full bg-[#FFEBCC]/60 blur-3xl" />
          <div className="absolute top-20 right-10 w-64 h-64 rounded-full bg-primary/8 blur-3xl" />
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-container text-primary text-xs font-semibold mb-8 border border-primary/10">
          <Icon name="auto_awesome" className="text-sm" />
          AI-first · Keyboard-first · Corsair-powered
        </div>

        <h1 className="font-headline text-5xl md:text-7xl text-ink-text leading-tight tracking-tight mb-6">
          Your team's Gmail<br />
          <span className="text-primary">intelligently organised</span>
        </h1>

        <p className="text-lg text-on-surface-variant max-w-2xl mx-auto mb-10 leading-relaxed">
          GooGenie connects Gmail and Google Calendar to a role-aware workspace. Every user sees their own inbox. Managers see their team's. Admins see everything — with a full audit trail.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/login" className="btn-primary text-base px-8 py-3">
            Get started free
            <Icon name="arrow_forward" />
          </Link>
          <a href="#how-it-works" className="btn-secondary text-base px-8 py-3">
            See how it works
          </a>
        </div>

        {/* Hero mock */}
        <div className="mt-16 relative max-w-4xl mx-auto">
          <div className="glass-panel rounded-3xl p-6 shadow-2xl text-left">
            {/* Mock toolbar */}
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-outline-variant/20">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-error/60" />
                <div className="w-3 h-3 rounded-full bg-tertiary/60" />
                <div className="w-3 h-3 rounded-full bg-primary/40" />
              </div>
              <div className="flex-1 mx-4 h-7 bg-surface-container rounded-full flex items-center px-4 text-xs text-on-surface-variant">
                <Icon name="lock" className="text-sm mr-2 text-outline" />
                app.googenie.ai/inbox
              </div>
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">R</div>
            </div>

            {/* Mock inbox rows */}
            <div className="space-y-2">
              {[
                { from: "Priya Sharma", subject: "Q3 roadmap review — need your input", time: "10:42 am", unread: true, snippet: "I've attached the latest deck. Can we align on priorities before..." },
                { from: "GitHub", subject: "[corsairdev/google-demo] PR #47 merged", time: "9:15 am", unread: false, snippet: "feat: add multi-tenant OAuth callback route" },
                { from: "Arjun Mehta", subject: "Team standup reschedule — June 14", time: "Yesterday", unread: false, snippet: "Hey, something came up — can we move standup to 10am?" },
              ].map((msg, i) => (
                <div key={i} className={`flex items-start gap-4 px-4 py-3 rounded-2xl transition-all ${msg.unread ? "bg-primary-container/40 border border-primary/10" : "hover:bg-surface-container/50"}`}>
                  <div className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-primary font-bold text-sm shrink-0">
                    {msg.from.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${msg.unread ? "font-bold text-ink-text" : "font-medium text-ink-text"}`}>{msg.from}</p>
                      <p className="text-xs text-on-surface-variant shrink-0">{msg.time}</p>
                    </div>
                    <p className={`text-sm truncate ${msg.unread ? "font-semibold text-ink-text" : "text-on-surface-variant"}`}>{msg.subject}</p>
                    <p className="text-xs text-on-surface-variant truncate mt-0.5">{msg.snippet}</p>
                  </div>
                  {msg.unread && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />}
                </div>
              ))}
            </div>

            {/* Compose button */}
            <div className="mt-4 flex justify-end">
              <div className="btn-primary text-sm cursor-default opacity-90">
                <Icon name="edit" className="text-base" />
                Compose
              </div>
            </div>
          </div>

          {/* Floating calendar chip */}
          <div className="absolute -right-6 top-12 glass-panel rounded-2xl px-4 py-3 shadow-xl hidden md:flex items-center gap-3 border border-primary/10">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <Icon name="calendar_month" className="text-white text-sm" />
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-text">Team sync</p>
              <p className="text-[11px] text-on-surface-variant">Today, 3:00 PM</p>
            </div>
          </div>

          {/* Floating audit chip */}
          <div className="absolute -left-6 bottom-12 glass-panel rounded-2xl px-4 py-3 shadow-xl hidden md:flex items-center gap-3 border border-outline-variant/20">
            <div className="w-8 h-8 rounded-xl bg-primary-container flex items-center justify-center">
              <Icon name="verified_user" className="text-primary text-sm" />
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-text">Audit logged</p>
              <p className="text-[11px] text-on-surface-variant">email_message_sent</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────── */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <p className="section-label mb-3">What you get</p>
          <h2 className="font-headline text-4xl text-ink-text">Everything your team needs</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass-panel rounded-2xl p-6 flex flex-col gap-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
              <div className="w-11 h-11 rounded-2xl bg-primary-container flex items-center justify-center">
                <Icon name={f.icon} className="text-primary text-xl" />
              </div>
              <div>
                <h3 className="font-semibold text-ink-text mb-1.5">{f.title}</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-gradient-to-br from-primary/5 via-transparent to-[#FFEBCC]/20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="section-label mb-3">Getting started</p>
          <h2 className="font-headline text-4xl text-ink-text mb-14">Up and running in 3 steps</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step, i) => (
              <div key={step.label} className="glass-panel rounded-2xl p-7 flex flex-col items-center gap-4 text-center relative">
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shadow-md">
                  {i + 1}
                </div>
                <div className="w-14 h-14 rounded-2xl bg-primary-container flex items-center justify-center mt-2">
                  <Icon name={step.icon} className="text-primary text-2xl" />
                </div>
                <div>
                  <p className="font-semibold text-ink-text mb-1">{step.label}</p>
                  <p className="text-sm text-on-surface-variant">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <Link href="/login" className="inline-flex btn-primary mt-12 text-base px-8 py-3">
            Connect your Gmail now
            <Icon name="arrow_forward" />
          </Link>
        </div>
      </section>

      {/* ── Roles ─────────────────────────────────────────────────── */}
      <section id="roles" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <p className="section-label mb-3">Access control</p>
          <h2 className="font-headline text-4xl text-ink-text">Built for every level of your org</h2>
          <p className="text-on-surface-variant mt-3 max-w-xl mx-auto">Three roles, each with a tailored view. No configuration required — role determines access automatically.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {ROLES.map((r) => (
            <div key={r.role} className="glass-panel rounded-2xl p-7 flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${r.color.split(" ")[0]}`}>
                  <Icon name={r.icon} className={`text-xl ${r.color.split(" ")[1]}`} />
                </div>
                <span className={`text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${r.color}`}>{r.role.replace("_", " ")}</span>
              </div>
              <ul className="space-y-2.5">
                {r.perks.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm text-on-surface-variant">
                    <Icon name="check_circle" className="text-primary text-base mt-px shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="section-label mb-3">Pricing</p>
            <h2 className="font-headline text-4xl text-ink-text mb-4">Simple, transparent pricing</h2>
            <p className="text-on-surface-variant max-w-xl mx-auto mb-8">Start free. Scale when you're ready. No hidden fees.</p>
            {/* Billing toggle */}
            <div className="inline-flex items-center gap-1 p-1 rounded-full" style={{ background: "var(--c-surface-container)", border: "1px solid var(--c-outline-variant)" }}>
              <button onClick={() => setBilling("monthly")} className="px-5 py-2 rounded-full text-sm font-semibold transition-all" style={billing === "monthly" ? { background: "var(--c-primary)", color: "var(--c-on-primary)" } : { color: "var(--c-on-surface-variant)" }}>Monthly</button>
              <button onClick={() => setBilling("annual")} className="px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2" style={billing === "annual" ? { background: "var(--c-primary)", color: "var(--c-on-primary)" } : { color: "var(--c-on-surface-variant)" }}>
                Annual
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: billing === "annual" ? "rgba(255,255,255,0.25)" : "color-mix(in srgb, var(--c-primary) 15%, transparent)", color: billing === "annual" ? "white" : "var(--c-primary)" }}>−17%</span>
              </button>
            </div>
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start mb-16">
            {PLANS.map((plan) => {
              const displayPrice = plan.price !== null && plan.price > 0 && billing === "annual"
                ? Math.round(plan.price * 0.83) : plan.price;
              return (
                <div
                  key={plan.name}
                  className={`relative rounded-3xl flex flex-col transition-all duration-200 ${plan.highlighted ? "shadow-2xl scale-[1.03] -translate-y-1" : "hover:shadow-lg hover:-translate-y-0.5"}`}
                  style={{
                    background: plan.highlighted ? "var(--c-surface-container)" : "var(--c-surface-container-low)",
                    border: plan.highlighted ? "2px solid color-mix(in srgb, var(--c-primary) 40%, transparent)" : "1px solid var(--c-outline-variant)",
                    padding: plan.highlighted ? "2rem" : "1.75rem",
                  }}
                >
                  {plan.badge && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold" style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}>{plan.badge}</div>
                  )}
                  <div className="flex items-center gap-3 mb-5">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${plan.color.split(" ")[0]}`}>
                      <Icon name={plan.icon} className={`text-xl ${plan.iconColor}`} />
                    </div>
                    <div>
                      <h3 className="font-headline text-xl text-ink-text">{plan.name}</h3>
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${plan.color}`}>{plan.name}</span>
                    </div>
                  </div>
                  <div className="mb-5">
                    <div className="flex items-end gap-1">
                      <span className="font-headline text-5xl text-ink-text leading-none">
                        {plan.price === null ? "Custom" : plan.price === 0 ? "Free" : `$${displayPrice}`}
                      </span>
                      {plan.period && plan.price !== null && plan.price > 0 && (
                        <span className="text-sm text-on-surface-variant mb-1">{plan.period}</span>
                      )}
                    </div>
                    {billing === "annual" && plan.price !== null && plan.price > 0 && (
                      <p className="text-xs text-on-surface-variant mt-1">
                        <span className="line-through">${plan.price}/mo</span>
                        <span className="font-semibold ml-1.5" style={{ color: "var(--c-primary)" }}>Save ${Math.round(plan.price * 12 * 0.17)}/yr</span>
                      </p>
                    )}
                    <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">{plan.description}</p>
                  </div>
                  <Link href={plan.ctaHref} className={`${plan.highlighted ? "btn-primary" : "btn-secondary"} text-sm w-full justify-center mb-6`}>
                    {plan.cta}
                    <Icon name={plan.name === "Enterprise" ? "mail" : "arrow_forward"} className="text-base" />
                  </Link>
                  <div className="h-px mb-5" style={{ background: "var(--c-outline-variant)" }} />
                  <ul className="space-y-3 flex-1">
                    {plan.features.map((f) => (
                      <li key={f.text} className="flex items-start gap-2.5 text-sm">
                        <Icon name={f.included ? "check_circle" : "cancel"} className="text-base mt-px shrink-0" style={{ color: f.included ? "var(--c-primary)" : "var(--c-outline)" }} />
                        <span style={{ color: f.included ? "var(--c-on-surface)" : "var(--c-outline)" }}>{f.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* FAQ */}
          <div className="max-w-3xl mx-auto">
            <h3 className="font-headline text-2xl text-ink-text text-center mb-8">Common questions</h3>
            <div className="space-y-3">
              {FAQS.map((faq, i) => (
                <div key={i} className="rounded-2xl overflow-hidden transition-all" style={{ border: "1px solid var(--c-outline-variant)", background: openFaq === i ? "var(--c-surface-container)" : "var(--c-surface-container-low)" }}>
                  <button className="w-full flex items-center justify-between px-6 py-4 text-left gap-4" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    <span className="font-semibold text-sm text-ink-text">{faq.q}</span>
                    <Icon name="expand_more" className="text-xl shrink-0 transition-transform" style={{ color: "var(--c-primary)", transform: openFaq === i ? "rotate(180deg)" : "rotate(0deg)" }} />
                  </button>
                  {openFaq === i && (
                    <div className="px-6 pb-5"><p className="text-sm leading-relaxed text-on-surface-variant">{faq.a}</p></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Tech stack strip ──────────────────────────────────────── */}
      <section className="py-12 border-y border-outline-variant/20 bg-surface-container-low/40">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="section-label mb-6">Built with</p>
          <div className="flex flex-wrap justify-center gap-4">
            {["Corsair SDK", "Clerk Auth", "Google Gmail API", "Google Calendar API", "Express + TypeScript", "React + Vite", "Tailwind CSS", "Pub/Sub Webhooks"].map((tech) => (
              <span key={tech} className="glass-panel px-4 py-2 rounded-full text-sm text-on-surface-variant border border-outline-variant/20">{tech}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 py-28 text-center">
        <div className="glass-panel rounded-3xl p-12 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/8 blur-2xl" />
            <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-[#FFEBCC]/50 blur-2xl" />
          </div>
          <div className="relative">
            <h2 className="font-headline text-4xl text-ink-text mb-4">Ready to bring order to your inbox?</h2>
            <p className="text-on-surface-variant mb-8 text-lg">Sign in with Google, connect your account, and your real inbox loads in under a minute.</p>
            <Link href="/login" className="btn-primary text-base px-10 py-3.5">
              Get started — it's free
              <Icon name="arrow_forward" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="border-t border-outline-variant/20 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center">
              <Icon name="cloud" className="text-white text-sm" />
            </div>
            <span className="font-headline text-base text-ink-text">GooGenie</span>
          </div>
          <p className="text-xs text-on-surface-variant">AI-first workspace for Google Workspace teams. Built with Corsair SDK.</p>
          <div className="flex items-center gap-4 text-xs">
            <a href="#pricing" className="text-primary font-semibold hover:underline">Pricing</a>
            <Link href="/login" className="text-primary font-semibold hover:underline">Sign in →</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
