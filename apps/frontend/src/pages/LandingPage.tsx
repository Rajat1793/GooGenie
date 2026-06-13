import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth as useClerkAuth } from "@clerk/react";
import { useTheme } from "../context/ThemeContext.tsx";

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
              <span className="material-symbols-outlined text-white text-base">cloud</span>
            </div>
            <span className="font-headline text-xl text-ink-text tracking-tight">Googenie</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-on-surface-variant">
            <a href="#features" className="hover:text-ink-text transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-ink-text transition-colors">How it works</a>
            <a href="#roles" className="hover:text-ink-text transition-colors">Roles</a>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={toggle} className="btn-ghost p-2" title="Toggle theme">
              <span className="material-symbols-outlined text-xl">{theme === "dark" ? "light_mode" : "dark_mode"}</span>
            </button>
          <Link to="/login" className="btn-primary text-sm">
            Sign in
            <span className="material-symbols-outlined text-base">arrow_forward</span>
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
          <span className="material-symbols-outlined text-sm">auto_awesome</span>
          AI-first · Keyboard-first · Corsair-powered
        </div>

        <h1 className="font-headline text-5xl md:text-7xl text-ink-text leading-tight tracking-tight mb-6">
          Your team's Gmail<br />
          <span className="text-primary">intelligently organised</span>
        </h1>

        <p className="text-lg text-on-surface-variant max-w-2xl mx-auto mb-10 leading-relaxed">
          Googenie connects Gmail and Google Calendar to a role-aware workspace. Every user sees their own inbox. Managers see their team's. Admins see everything — with a full audit trail.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/login" className="btn-primary text-base px-8 py-3">
            Get started free
            <span className="material-symbols-outlined">arrow_forward</span>
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
                <span className="material-symbols-outlined text-sm mr-2 text-outline">lock</span>
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
                <span className="material-symbols-outlined text-base">edit</span>
                Compose
              </div>
            </div>
          </div>

          {/* Floating calendar chip */}
          <div className="absolute -right-6 top-12 glass-panel rounded-2xl px-4 py-3 shadow-xl hidden md:flex items-center gap-3 border border-primary/10">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-sm">calendar_month</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-text">Team sync</p>
              <p className="text-[11px] text-on-surface-variant">Today, 3:00 PM</p>
            </div>
          </div>

          {/* Floating audit chip */}
          <div className="absolute -left-6 bottom-12 glass-panel rounded-2xl px-4 py-3 shadow-xl hidden md:flex items-center gap-3 border border-outline-variant/20">
            <div className="w-8 h-8 rounded-xl bg-primary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-sm">verified_user</span>
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
                <span className="material-symbols-outlined text-primary text-xl">{f.icon}</span>
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
                  <span className="material-symbols-outlined text-primary text-2xl">{step.icon}</span>
                </div>
                <div>
                  <p className="font-semibold text-ink-text mb-1">{step.label}</p>
                  <p className="text-sm text-on-surface-variant">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <Link to="/login" className="inline-flex btn-primary mt-12 text-base px-8 py-3">
            Connect your Gmail now
            <span className="material-symbols-outlined">arrow_forward</span>
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
                  <span className={`material-symbols-outlined text-xl ${r.color.split(" ")[1]}`}>{r.icon}</span>
                </div>
                <span className={`text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${r.color}`}>{r.role.replace("_", " ")}</span>
              </div>
              <ul className="space-y-2.5">
                {r.perks.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-base mt-px shrink-0">check_circle</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
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
            <Link to="/login" className="btn-primary text-base px-10 py-3.5">
              Get started — it's free
              <span className="material-symbols-outlined">arrow_forward</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="border-t border-outline-variant/20 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-sm">cloud</span>
            </div>
            <span className="font-headline text-base text-ink-text">Googenie</span>
          </div>
          <p className="text-xs text-on-surface-variant">AI-first workspace for Google Workspace teams. Built with Corsair SDK.</p>
          <Link to="/login" className="text-xs text-primary font-semibold hover:underline">Sign in →</Link>
        </div>
      </footer>

    </div>
  );
}
