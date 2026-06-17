"use client";

import { SignIn } from "@clerk/nextjs";
import { useAuth as useClerkAuth } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Navigate, useNavigate } from "../lib/router-shim";
import { useTheme } from "../contexts/ThemeContext";
import { useEffect, useState } from "react";
import { setDemoToken } from "../api/client";
import { STORAGE_KEYS } from "../lib/storage";
import { Icon } from "../components/Icon";

export function LoginPage() {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"user" | "super_admin" | "manager_admin">("user");
  const [demoAccounts, setDemoAccounts] = useState<Array<{ role: string; label: string; token: string; email: string }>>([]);
  const [demoLoading, setDemoLoading] = useState(false);

  if (isLoaded && isSignedIn) return <Navigate to="/" replace />;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.pendingRole, tab);
  }, [tab]);

  // Fetch demo accounts from backend on mount
  useEffect(() => {
    fetch("/v1/demo/tokens")
      .then((r) => r.json())
      .then((d) => { if (d.accounts) setDemoAccounts(d.accounts); })
      .catch(() => null);
  }, []);

  async function handleDemoLogin(token: string) {
    setDemoLoading(true);
    setDemoToken(token);
    navigate("/inbox");
  }

  const isDark = theme === "dark";

  // Use Clerk's polished baseTheme for dark mode, then layer minimal brand overrides.
  // colorPrimary mirrors --c-primary from the global theme (ink-black on light,
  // cream on dark) so Clerk's submit button matches the rest of our CTAs.
  const clerkAppearance = {
    baseTheme: isDark ? dark : undefined,
    variables: {
      colorPrimary: isDark ? "#F2EFE7" : "#0F1115",
      borderRadius: "8px",
      fontFamily: "inherit",
      fontSize: "14px",
    },
    elements: {
      rootBox: "w-full",
      card: "shadow-none",
      socialButtonsBlockButton:
        "w-full rounded-lg font-semibold text-sm h-11 transition-all",
      formFieldInput: "rounded-lg text-sm h-11",
      formFieldLabel: "text-xs font-medium",
      formButtonPrimary:
        "w-full h-11 rounded-lg font-semibold text-sm transition-all hover:opacity-90",
      footerActionLink: "font-semibold",
    },
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative"
      style={{ background: "var(--c-background)" }}>

      {/* Theme toggle */}
      <button onClick={toggle} className="btn-ghost absolute top-5 right-5">
        <Icon name={isDark ? "light_mode" : "dark_mode"} />
      </button>

      <div className="w-full max-w-[400px] mx-4 flex flex-col items-center gap-5">

        {/* Logo — matches the landing-page brand mark: coral tile with sparkle */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: "var(--c-tertiary)" }}>
            <Icon name="auto_awesome" className="text-base" style={{ color: "var(--c-on-tertiary)", fontVariationSettings: "FILL 1" }} />
          </div>
          <div>
            <h1 className="font-headline text-2xl leading-tight font-semibold" style={{ color: "var(--c-on-surface)" }}>GooGenie</h1>
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold"
              style={{ color: "var(--c-on-surface-variant)" }}>AI Workspace</p>
          </div>
        </div>

        {/* Role selector */}
        <div className="w-full">
          <p className="section-label mb-2 text-center">Sign in as</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: "user"          as const, label: "Member",  icon: "person" },
              { key: "manager_admin" as const, label: "Manager", icon: "school" },
              { key: "super_admin"   as const, label: "Admin",   icon: "admin_panel_settings" },
            ]).map((t) => {
              const active = tab === t.key;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className="nav-item flex-col gap-1 py-2.5 px-2 rounded-xl text-center transition-all duration-150 h-auto"
                  style={active ? {
                    background: "color-mix(in srgb, var(--c-primary) 12%, transparent)",
                    color: "var(--c-primary)",
                    border: "1px solid color-mix(in srgb, var(--c-primary) 25%, transparent)",
                  } : {
                    border: "1px solid var(--c-outline-variant)",
                  }}>
                  <Icon name={t.icon} className="text-[18px]" style={{ fontVariationSettings: active ? "FILL 1" : "FILL 0" }} />
                  <span className="text-[11px] font-semibold">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Clerk form — renders its own card */}
        <div className="w-full">
          <SignIn routing="hash" appearance={clerkAppearance} />
        </div>

        {/* Demo quick-login — only shown when demo tokens are configured */}
        {demoAccounts.length > 0 && (
          <div className="w-full">
            <div className="flex items-center gap-2 mb-3">
              <div style={{ flex: 1, height: 1, background: "var(--c-outline-variant)" }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--c-on-surface-variant)" }}>or try a demo account</span>
              <div style={{ flex: 1, height: 1, background: "var(--c-outline-variant)" }} />
            </div>
            <div className="flex flex-col gap-2">
              {demoAccounts.map((acct) => (
                <button
                  key={acct.role + acct.label}
                  onClick={() => handleDemoLogin(acct.token)}
                  disabled={demoLoading}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all"
                  style={{
                    border: "1px solid var(--c-outline-variant)",
                    background: "var(--c-surface-container)",
                    opacity: demoLoading ? 0.6 : 1,
                  }}
                >
                  <Icon name={acct.role === "super_admin" ? "admin_panel_settings" : acct.role === "manager_admin" ? "school" : "person"} className="text-base" style={{ color: "var(--c-primary)", fontVariationSettings: "FILL 1" }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold leading-tight"
                      style={{ color: "var(--c-on-surface)" }}>{acct.label}</div>
                    <div className="text-[11px] truncate"
                      style={{ color: "var(--c-on-surface-variant)" }}>{acct.email}</div>
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                    style={{
                      background: "color-mix(in srgb, var(--c-primary) 12%, transparent)",
                      color: "var(--c-primary)"
                    }}>demo</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

