import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth as useClerkAuth } from "@clerk/react";
import { useTheme } from "../context/ThemeContext.tsx";

const PLANS = [
  {
    name: "Learner",
    price: 0,
    priceLabel: "Free forever",
    period: null,
    description: "Perfect for individuals exploring GooGenie. No credit card required.",
    color: "bg-secondary-container text-secondary",
    iconColor: "text-secondary",
    icon: "school",
    highlighted: false,
    cta: "Get started free",
    ctaStyle: "btn-secondary",
    features: [
      { text: "Personal Gmail inbox (read & send)", included: true },
      { text: "Google Calendar view", included: true },
      { text: "Up to 50 emails/day", included: true },
      { text: "Basic search", included: true },
      { text: "HTML email rendering", included: true },
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
    priceLabel: "$199",
    period: "/ month",
    description: "For growing teams that need collaboration, role-based access, and real-time sync.",
    color: "bg-primary-container text-primary",
    iconColor: "text-primary",
    icon: "rocket_launch",
    highlighted: true,
    cta: "Start 14-day trial",
    ctaStyle: "btn-primary",
    badge: "Most popular",
    features: [
      { text: "Everything in Learner", included: true },
      { text: "Unlimited emails", included: true },
      { text: "Up to 25 team members", included: true },
      { text: "Google Meet in events", included: true },
      { text: "Team hierarchy (Org Tree)", included: true },
      { text: "Manager-level views", included: true },
      { text: "Gmail category tabs", included: true },
      { text: "Audit trail (30-day retention)", included: true },
      { text: "Webhook real-time push", included: true },
      { text: "Priority email support", included: true },
    ],
  },
  {
    name: "Enterprise",
    price: null,
    priceLabel: "Custom",
    period: null,
    description: "Tailored for large organisations with custom integrations, SLAs, and dedicated support.",
    color: "bg-error-container text-error",
    iconColor: "text-error",
    icon: "domain",
    highlighted: false,
    cta: "Contact sales",
    ctaStyle: "btn-secondary",
    features: [
      { text: "Everything in Startup", included: true },
      { text: "Unlimited team members", included: true },
      { text: "Custom OAuth & SSO", included: true },
      { text: "Dedicated infrastructure", included: true },
      { text: "Audit trail (unlimited retention)", included: true },
      { text: "Custom role definitions", included: true },
      { text: "SLA guarantee (99.9% uptime)", included: true },
      { text: "Onboarding & training sessions", included: true },
      { text: "Dedicated account manager", included: true },
      { text: "Custom integrations on request", included: true },
    ],
  },
];

const FAQS = [
  {
    q: "Is the Learner plan really free forever?",
    a: "Yes — no credit card, no trial expiry. The Learner plan is permanently free for individuals with a single Google account.",
  },
  {
    q: "What counts as a 'team member' in Startup?",
    a: "Any user invited to your GooGenie workspace. Managers and admins each count as one seat.",
  },
  {
    q: "Can I switch plans at any time?",
    a: "Absolutely. Upgrade or downgrade at any time. Upgrades take effect immediately; downgrades apply at the next billing cycle.",
  },
  {
    q: "Do you offer annual billing?",
    a: "Yes — pay annually and get 2 months free (effectively 17% off). Contact us to switch.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit/debit cards (Visa, Mastercard, Amex), and bank transfer for Enterprise contracts.",
  },
  {
    q: "Is my Google data safe?",
    a: "Yes. OAuth tokens are encrypted at rest per-tenant using AES-256 (Corsair KEK). We never store email content — all reads are live from the Gmail API.",
  },
];

export function PricingPage() {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    if (isLoaded && isSignedIn) navigate("/inbox", { replace: true });
  }, [isLoaded, isSignedIn, navigate]);

  const annualDiscount = 0.83; // 17% off = 2 months free

  return (
    <div className="min-h-screen overflow-x-hidden">

      {/* ── Nav ── */}
      <header className="glass-header sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-base">cloud</span>
            </div>
            <span className="font-headline text-xl text-ink-text tracking-tight">GooGenie</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-on-surface-variant">
            <Link to="/" className="hover:text-ink-text transition-colors">Home</Link>
            <Link to="/#features" className="hover:text-ink-text transition-colors">Features</Link>
            <Link to="/pricing" className="text-primary font-semibold">Pricing</Link>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={toggle} className="btn-ghost p-2" title="Toggle theme">
              <span className="material-symbols-outlined text-xl">{theme === "dark" ? "light_mode" : "dark_mode"}</span>
            </button>
            <Link to="/login" className="btn-primary text-sm">
              Sign in
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="pt-20 pb-10 text-center px-6">
        <p className="section-label mb-3">Pricing</p>
        <h1 className="font-headline text-5xl text-ink-text mb-4 leading-tight">
          Simple, transparent<br />
          <span className="text-primary">pricing</span>
        </h1>
        <p className="text-lg text-on-surface-variant max-w-xl mx-auto mb-8 leading-relaxed">
          Start free. Scale when you're ready. No hidden fees, no per-seat surprises.
        </p>

        {/* Billing toggle */}
        <div className="inline-flex items-center gap-1 p-1 rounded-full" style={{ background: "var(--c-surface-container)", border: "1px solid var(--c-outline-variant)" }}>
          <button
            onClick={() => setBilling("monthly")}
            className="px-5 py-2 rounded-full text-sm font-semibold transition-all"
            style={billing === "monthly"
              ? { background: "var(--c-primary)", color: "var(--c-on-primary)" }
              : { color: "var(--c-on-surface-variant)" }}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling("annual")}
            className="px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2"
            style={billing === "annual"
              ? { background: "var(--c-primary)", color: "var(--c-on-primary)" }
              : { color: "var(--c-on-surface-variant)" }}
          >
            Annual
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: billing === "annual" ? "rgba(255,255,255,0.25)" : "color-mix(in srgb, var(--c-primary) 15%, transparent)", color: billing === "annual" ? "white" : "var(--c-primary)" }}>
              −17%
            </span>
          </button>
        </div>
      </section>

      {/* ── Plans ── */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {PLANS.map((plan) => {
            const displayPrice = plan.price !== null && plan.price > 0 && billing === "annual"
              ? Math.round(plan.price * annualDiscount)
              : plan.price;

            return (
              <div
                key={plan.name}
                className={`relative rounded-3xl flex flex-col transition-all duration-200 ${plan.highlighted ? "shadow-2xl scale-[1.03] -translate-y-1" : "hover:shadow-lg hover:-translate-y-0.5"}`}
                style={{
                  background: plan.highlighted ? "var(--c-surface-container)" : "var(--c-surface-container-low)",
                  border: plan.highlighted
                    ? "2px solid color-mix(in srgb, var(--c-primary) 40%, transparent)"
                    : "1px solid var(--c-outline-variant)",
                  padding: plan.highlighted ? "2rem" : "1.75rem",
                }}
              >
                {/* Most popular badge */}
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold" style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}>
                    {plan.badge}
                  </div>
                )}

                {/* Plan header */}
                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${plan.color.split(" ")[0]}`}>
                    <span className={`material-symbols-outlined text-xl ${plan.iconColor}`}>{plan.icon}</span>
                  </div>
                  <div>
                    <h2 className="font-headline text-xl text-ink-text">{plan.name}</h2>
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${plan.color}`}>{plan.name}</span>
                  </div>
                </div>

                {/* Price */}
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
                      <span className="text-primary font-semibold ml-1.5">Save ${Math.round(plan.price * 12 * 0.17)}/yr</span>
                    </p>
                  )}
                  <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">{plan.description}</p>
                </div>

                {/* CTA */}
                <Link
                  to={plan.name === "Enterprise" ? "mailto:sales@googenie.ai" : "/login"}
                  className={`${plan.ctaStyle} text-sm w-full justify-center mb-6`}
                >
                  {plan.cta}
                  <span className="material-symbols-outlined text-base">{plan.name === "Enterprise" ? "mail" : "arrow_forward"}</span>
                </Link>

                {/* Divider */}
                <div className="h-px mb-5" style={{ background: "var(--c-outline-variant)" }} />

                {/* Features */}
                <ul className="space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2.5 text-sm">
                      <span
                        className="material-symbols-outlined text-base mt-px shrink-0"
                        style={{ color: f.included ? "var(--c-primary)" : "var(--c-outline)" }}
                      >
                        {f.included ? "check_circle" : "cancel"}
                      </span>
                      <span style={{ color: f.included ? "var(--c-on-surface)" : "var(--c-outline)" }}>
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* All plans note */}
        <p className="text-center text-sm text-on-surface-variant mt-10">
          All plans include SSL encryption, GDPR-ready data handling, and 99% uptime SLA.
          <a href="mailto:sales@googenie.ai" className="text-primary font-semibold ml-1.5 hover:underline">Questions? Talk to us →</a>
        </p>
      </section>

      {/* ── Comparison table ── */}
      <section className="py-20 border-y" style={{ borderColor: "var(--c-outline-variant)", background: "var(--c-surface-container-low)" }}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="section-label mb-3">Compare plans</p>
            <h2 className="font-headline text-3xl text-ink-text">Feature by feature</h2>
          </div>

          <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--c-outline-variant)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--c-surface-container)", borderBottom: "1px solid var(--c-outline-variant)" }}>
                  <th className="text-left px-6 py-4 font-semibold text-ink-text w-1/2">Feature</th>
                  {PLANS.map((p) => (
                    <th key={p.name} className="px-6 py-4 font-semibold text-center" style={{ color: "var(--c-on-surface)" }}>
                      <span className={`text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${p.color}`}>{p.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Gmail read & send", learner: true, startup: true, enterprise: true },
                  { label: "Google Calendar", learner: true, startup: true, enterprise: true },
                  { label: "HTML email rendering", learner: true, startup: true, enterprise: true },
                  { label: "Gmail category tabs", learner: true, startup: true, enterprise: true },
                  { label: "Unlimited emails", learner: false, startup: true, enterprise: true },
                  { label: "Google Meet in events", learner: false, startup: true, enterprise: true },
                  { label: "Calendar month view", learner: true, startup: true, enterprise: true },
                  { label: "Team hierarchy (Org Tree)", learner: false, startup: true, enterprise: true },
                  { label: "Manager-level inbox views", learner: false, startup: true, enterprise: true },
                  { label: "Role-based access control", learner: false, startup: true, enterprise: true },
                  { label: "Audit trail", learner: false, startup: "30 days", enterprise: "Unlimited" },
                  { label: "Webhook real-time push", learner: false, startup: true, enterprise: true },
                  { label: "Custom SSO / OAuth", learner: false, startup: false, enterprise: true },
                  { label: "Dedicated infrastructure", learner: false, startup: false, enterprise: true },
                  { label: "SLA guarantee", learner: false, startup: false, enterprise: "99.9%" },
                  { label: "Dedicated account manager", learner: false, startup: false, enterprise: true },
                ].map((row, i) => (
                  <tr key={row.label} style={{ borderBottom: "1px solid var(--c-outline-variant)", background: i % 2 === 0 ? "transparent" : "var(--c-surface-container-low)" }}>
                    <td className="px-6 py-3.5 font-medium" style={{ color: "var(--c-on-surface)" }}>{row.label}</td>
                    {(["learner", "startup", "enterprise"] as const).map((key) => {
                      const val = row[key];
                      return (
                        <td key={key} className="px-6 py-3.5 text-center">
                          {typeof val === "string" ? (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "color-mix(in srgb, var(--c-primary) 12%, transparent)", color: "var(--c-primary)" }}>{val}</span>
                          ) : val ? (
                            <span className="material-symbols-outlined text-base" style={{ color: "var(--c-primary)" }}>check_circle</span>
                          ) : (
                            <span className="material-symbols-outlined text-base" style={{ color: "var(--c-outline)" }}>remove</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-3xl mx-auto px-6 py-24">
        <div className="text-center mb-12">
          <p className="section-label mb-3">FAQ</p>
          <h2 className="font-headline text-3xl text-ink-text">Common questions</h2>
        </div>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div
              key={i}
              className="rounded-2xl overflow-hidden transition-all"
              style={{ border: "1px solid var(--c-outline-variant)", background: openFaq === i ? "var(--c-surface-container)" : "var(--c-surface-container-low)" }}
            >
              <button
                className="w-full flex items-center justify-between px-6 py-4 text-left gap-4"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <span className="font-semibold text-sm" style={{ color: "var(--c-on-surface)" }}>{faq.q}</span>
                <span className="material-symbols-outlined text-xl shrink-0 transition-transform" style={{ color: "var(--c-primary)", transform: openFaq === i ? "rotate(180deg)" : "rotate(0deg)" }}>expand_more</span>
              </button>
              {openFaq === i && (
                <div className="px-6 pb-5">
                  <p className="text-sm leading-relaxed" style={{ color: "var(--c-on-surface-variant)" }}>{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-3xl mx-auto px-6 pb-28 text-center">
        <div className="glass-panel rounded-3xl p-12 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-2xl" style={{ background: "color-mix(in srgb, var(--c-primary) 8%, transparent)" }} />
            <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full blur-2xl" style={{ background: "color-mix(in srgb, var(--c-secondary) 12%, transparent)" }} />
          </div>
          <div className="relative">
            <span className="material-symbols-outlined text-4xl mb-4 block" style={{ color: "var(--c-primary)" }}>rocket_launch</span>
            <h2 className="font-headline text-3xl text-ink-text mb-3">Start free today</h2>
            <p className="text-on-surface-variant mb-8 text-base">No credit card. No setup fee. Your inbox in under a minute.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/login" className="btn-primary text-base px-8 py-3">
                Get started free
                <span className="material-symbols-outlined">arrow_forward</span>
              </Link>
              <a href="mailto:sales@googenie.ai" className="btn-secondary text-base px-8 py-3">
                Talk to sales
                <span className="material-symbols-outlined">mail</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t py-10" style={{ borderColor: "var(--c-outline-variant)" }}>
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-sm">cloud</span>
            </div>
            <span className="font-headline text-base text-ink-text">GooGenie</span>
          </div>
          <p className="text-xs text-on-surface-variant">AI-first workspace for Google Workspace teams. Built with Corsair SDK.</p>
          <div className="flex items-center gap-4 text-xs">
            <Link to="/pricing" className="text-primary font-semibold hover:underline">Pricing</Link>
            <a href="mailto:sales@googenie.ai" className="text-on-surface-variant hover:text-ink-text transition-colors">Contact</a>
            <Link to="/login" className="text-primary font-semibold hover:underline">Sign in →</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
