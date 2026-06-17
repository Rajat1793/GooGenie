"use client";

/**
 * /pricing — dedicated, deep-linkable pricing page.
 *
 * Tells the SAME story as the landing-page #tiers section (Included / Premium
 * / Enterprise) but with the room to show the full feature table, FAQ, and an
 * extended Enterprise pitch. Source of truth for both surfaces is the shared
 * FEATURE_CATALOG so a new feature only needs one edit.
 *
 * Visual system: inherits the new Superhuman-style CSS variables from
 * src/styles/index.css (cream + ink palette, coral accent, Inter + Space
 * Grotesk fonts). We use inline-style helpers where we need to compose colours
 * dynamically (light vs dark accent variants).
 */

import Link from "next/link";
import { useNavigate } from "../lib/router-shim";
import { useEffect, useState } from "react";
import { useAuth as useClerkAuth } from "@clerk/nextjs";
import { useTheme } from "../contexts/ThemeContext";
import { Icon } from "../components/Icon";
import { FEATURE_CATALOG } from "../../app/api/v1/me/_catalog";

// ── Tier definitions ─────────────────────────────────────────────────────────
// These mirror the landing page exactly so users don't see contradictory pricing
// depending on which surface they hit.
type TierKey = "included" | "premium" | "enterprise";

interface Tier {
  key: TierKey;
  name: string;
  price: string;
  priceSuffix: string;
  tagline: string;
  description: string;
  cta: { label: string; href: string };
  highlight: boolean;
}

const basicCount = FEATURE_CATALOG.filter((f) => f.tier === "basic").length;
const premiumCount = FEATURE_CATALOG.filter((f) => f.tier === "addon").length;

const TIERS: Tier[] = [
  {
    key: "included",
    name: "Included",
    price: "$0",
    priceSuffix: "/user / month",
    tagline: "Free forever",
    description: `${basicCount} basic features auto-enabled on signup. No request, no approval, no token meter.`,
    cta: { label: "Get started", href: "/login" },
    highlight: false,
  },
  {
    key: "premium",
    name: "Premium",
    price: "$9",
    priceSuffix: "/user / month",
    tagline: "Pay-as-you-go",
    description: `Unlock all ${premiumCount} AI-powered features. Each request from a user goes to a manager for approval — no surprises on the invoice.`,
    cta: { label: "Try premium free", href: "/login" },
    highlight: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Custom",
    priceSuffix: "",
    tagline: "Bring-your-own-keys",
    description: "Self-hosted Mistral / OpenAI keys, SSO, dedicated support, audit-trail retention, custom RBAC roles, and uptime SLA.",
    cta: { label: "Contact sales", href: "mailto:sales@googenie.ai" },
    highlight: false,
  },
];

// FAQ kept here (not on landing page) so the page has its own depth.
const FAQS = [
  {
    q: "What's the difference between 'basic' and 'premium' features?",
    a: `Basic features run entirely on local data — no AI tokens are spent. They're free forever and seeded ON for every new user. Premium features call an LLM (Mistral by default) and are billed per-request. A user requests access, their manager approves, and the manager sees the running cost.`,
  },
  {
    q: "Who pays the AI bill?",
    a: "The workspace owner (Enterprise) or the per-seat Premium plan. We bundle a generous per-seat token allowance — for typical inbox use, you'll never hit the cap. Heavy users (think 200+ emails/day with AI summaries on every thread) may bump into the cap mid-month; we'll warn before any throttle.",
  },
  {
    q: "Can my manager turn features off for individuals?",
    a: "Yes. Every premium feature has a per-user toggle in the Manager dashboard. Granted features can be revoked at any time — the next API call returns a 403 and the UI surfaces a 'request access' prompt.",
  },
  {
    q: "What counts as a 'seat' on Premium?",
    a: "One Google account = one seat. Managers and admins each count as one seat. Service accounts and shared inboxes don't count.",
  },
  {
    q: "Do you store my emails?",
    a: "No. Email bodies are read live from the Gmail API on each request. We store metadata only (thread IDs, labels, audit logs). OAuth tokens are AES-256 encrypted at rest with per-tenant Corsair KEKs.",
  },
  {
    q: "Annual billing?",
    a: "Yes — annual billing gets you ~17% off (effectively 2 months free). Contact us to switch.",
  },
];

export function PricingPage() {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Signed-in users have no business on a pricing page — push them home.
  useEffect(() => {
    if (isLoaded && isSignedIn) navigate("/inbox", { replace: true });
  }, [isLoaded, isSignedIn, navigate]);

  const isDark = theme === "dark";
  // Coral accent (matches landing page LIGHT/DARK_PALETTE)
  const accent = isDark ? "#FF6B52" : "#E94B35";
  const accentInk = "#FFFFFF";
  // Premium card background: a dark panel so it stands out on both themes
  const premiumBg = isDark ? "#000000" : "#0A0B0E";
  const premiumInk = "#F2EFE7";
  const premiumMuted = "rgba(242,239,231,0.65)";

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "var(--c-background)", color: "var(--c-on-surface)" }}>

      {/* ── Nav (mirrors landing page) ── */}
      <header className="sticky top-0 z-50" style={{
        background: isDark ? "rgba(10,11,14,0.85)" : "rgba(247,246,242,0.85)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: `1px solid var(--c-outline-variant)`,
      }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: accent }}>
              <Icon name="auto_awesome" className="text-base" style={{ color: accentInk, fontVariationSettings: "FILL 1" }} />
            </div>
            <span className="font-headline text-xl font-semibold tracking-tight" style={{ color: "var(--c-on-surface)" }}>GooGenie</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm" style={{ color: "var(--c-on-surface-variant)" }}>
            <Link href="/" className="hover:opacity-70 transition-opacity">Home</Link>
            <Link href="/#features" className="hover:opacity-70 transition-opacity">Features</Link>
            <Link href="/pricing" className="font-semibold" style={{ color: "var(--c-on-surface)" }}>Pricing</Link>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={toggle} className="btn-ghost p-2" title="Toggle theme">
              <Icon name={isDark ? "light_mode" : "dark_mode"} className="text-xl" />
            </button>
            <Link href="/login" className="btn-primary text-sm">
              Sign in
              <Icon name="arrow_forward" className="text-base" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="pt-20 pb-12 text-center px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-4" style={{ color: accent }}>
          Pricing
        </p>
        <h1 className="font-headline text-5xl md:text-6xl font-semibold mb-5 leading-[1.05] tracking-tight" style={{ color: "var(--c-on-surface)" }}>
          Free where it should be.
          <br />
          Paid where it matters.
        </h1>
        <p className="text-lg max-w-2xl mx-auto leading-relaxed" style={{ color: "var(--c-on-surface-variant)" }}>
          Local features that don't burn AI tokens are free forever. Token-billed
          features sit behind a simple request → grant flow your manager controls.
        </p>
      </section>

      {/* ── Tier cards ── */}
      <section className="pb-20 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {TIERS.map((tier) => {
            const isPremium = tier.key === "premium";
            return (
              <div
                key={tier.key}
                className="rounded-2xl p-8 flex flex-col relative transition-transform"
                style={{
                  background: isPremium ? premiumBg : "var(--c-surface-container-lowest)",
                  border: `1px solid ${isPremium ? premiumBg : "var(--c-outline-variant)"}`,
                  color: isPremium ? premiumInk : "var(--c-on-surface)",
                }}
              >
                {tier.highlight && (
                  <span
                    className="absolute -top-3 right-6 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
                    style={{ background: accent, color: accentInk }}
                  >
                    Most popular
                  </span>
                )}
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-widest"
                    style={
                      isPremium
                        ? { background: accent, color: accentInk }
                        : { background: "var(--c-surface-container)", color: "var(--c-on-surface)", border: "1px solid var(--c-outline-variant)" }
                    }
                  >
                    {tier.name}
                  </span>
                  <span className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: isPremium ? premiumMuted : "var(--c-on-surface-variant)" }}>
                    {tier.tagline}
                  </span>
                </div>
                <h3 className="font-headline text-[42px] font-semibold tracking-tight leading-none mt-3 mb-1">
                  {tier.price}
                  {tier.priceSuffix && (
                    <span className="text-[16px] font-normal ml-1" style={{ color: isPremium ? premiumMuted : "var(--c-on-surface-variant)" }}>
                      {tier.priceSuffix}
                    </span>
                  )}
                </h3>
                <p className="text-[14px] mb-6 leading-relaxed" style={{ color: isPremium ? premiumMuted : "var(--c-on-surface-variant)" }}>
                  {tier.description}
                </p>
                <Link
                  href={tier.cta.href}
                  className="mt-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-[14px] font-semibold transition-transform hover:scale-[1.02]"
                  style={
                    isPremium
                      ? { background: accent, color: accentInk }
                      : { background: "var(--c-primary)", color: "var(--c-on-primary)" }
                  }
                >
                  {tier.cta.label}
                  <Icon name="arrow_forward" className="text-[16px]" />
                </Link>
              </div>
            );
          })}
        </div>

        <p className="text-center text-sm mt-6" style={{ color: "var(--c-on-surface-variant)" }}>
          All plans include unlimited workspace members on the same Gmail / Google Calendar.{" "}
          <a href="mailto:sales@googenie.ai" className="font-semibold hover:underline" style={{ color: accent }}>
            Questions? Talk to us →
          </a>
        </p>
      </section>

      {/* ── Feature matrix (sourced from FEATURE_CATALOG) ── */}
      <section className="py-20 px-6" style={{ background: "var(--c-surface-container-low)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-3" style={{ color: accent }}>
              Feature by feature
            </p>
            <h2 className="font-headline text-3xl md:text-4xl font-semibold tracking-tight" style={{ color: "var(--c-on-surface)" }}>
              Every capability, every tier
            </h2>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--c-surface-container-lowest)", border: "1px solid var(--c-outline-variant)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--c-outline-variant)" }}>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--c-on-surface-variant)" }}>
                    Feature
                  </th>
                  <th className="text-center px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--c-on-surface-variant)", width: "120px" }}>
                    Included
                  </th>
                  <th className="text-center px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: accent, width: "120px" }}>
                    Premium
                  </th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_CATALOG.map((f) => {
                  const inBasic = f.tier === "basic";
                  return (
                    <tr key={f.key} style={{ borderTop: "1px solid var(--c-outline-variant)" }}>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-[13.5px]" style={{ color: "var(--c-on-surface)" }}>{f.label}</div>
                        {f.description && (
                          <div className="text-[12px] mt-0.5" style={{ color: "var(--c-on-surface-variant)" }}>{f.description}</div>
                        )}
                      </td>
                      <td className="text-center px-5 py-3.5">
                        {inBasic ? (
                          <Icon name="check" className="text-[18px]" style={{ color: "var(--c-on-surface)" }} />
                        ) : (
                          <span style={{ color: "var(--c-outline)" }}>—</span>
                        )}
                      </td>
                      <td className="text-center px-5 py-3.5">
                        <Icon name="check" className="text-[18px]" style={{ color: accent }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-3" style={{ color: accent }}>
              Common questions
            </p>
            <h2 className="font-headline text-3xl md:text-4xl font-semibold tracking-tight" style={{ color: "var(--c-on-surface)" }}>
              Pricing, plainly explained
            </h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((faq, i) => {
              const open = openFaq === i;
              return (
                <div
                  key={i}
                  className="rounded-xl overflow-hidden transition-all"
                  style={{ background: "var(--c-surface-container-lowest)", border: "1px solid var(--c-outline-variant)" }}
                >
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <span className="font-semibold text-[14.5px]" style={{ color: "var(--c-on-surface)" }}>{faq.q}</span>
                    <Icon
                      name={open ? "remove" : "add"}
                      className="text-[20px] shrink-0"
                      style={{ color: "var(--c-on-surface-variant)" }}
                    />
                  </button>
                  {open && (
                    <div className="px-5 pb-4 text-[14px] leading-relaxed" style={{ color: "var(--c-on-surface-variant)" }}>
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-20 px-6 text-center" style={{ background: "var(--c-surface-container-low)" }}>
        <div className="max-w-2xl mx-auto">
          <h2 className="font-headline text-3xl md:text-4xl font-semibold tracking-tight mb-3" style={{ color: "var(--c-on-surface)" }}>
            Start free today
          </h2>
          <p className="text-base mb-7" style={{ color: "var(--c-on-surface-variant)" }}>
            {basicCount} basic features are seeded ON the moment you sign in. Upgrade only when your team is ready.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/login" className="btn-primary text-base px-8 py-3">
              Get GooGenie free
              <Icon name="arrow_forward" className="text-base" />
            </Link>
            <a href="mailto:sales@googenie.ai" className="btn-secondary text-base px-8 py-3">
              Talk to sales
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t py-10 px-6" style={{ borderColor: "var(--c-outline-variant)" }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: accent }}>
              <Icon name="auto_awesome" className="text-sm" style={{ color: accentInk, fontVariationSettings: "FILL 1" }} />
            </div>
            <span className="font-headline text-base font-semibold" style={{ color: "var(--c-on-surface)" }}>GooGenie</span>
          </div>
          <p className="text-xs" style={{ color: "var(--c-on-surface-variant)" }}>
            AI-first workspace for Google Workspace teams. Built with Corsair SDK.
          </p>
          <div className="flex items-center gap-4 text-xs">
            <Link href="/pricing" className="font-semibold hover:underline" style={{ color: accent }}>Pricing</Link>
            <a href="mailto:sales@googenie.ai" className="hover:opacity-70 transition-opacity" style={{ color: "var(--c-on-surface-variant)" }}>Contact</a>
            <Link href="/login" className="font-semibold hover:underline" style={{ color: accent }}>Sign in →</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
