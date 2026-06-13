import { SignIn } from "@clerk/react";
import { useAuth as useClerkAuth } from "@clerk/react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext.tsx";
import { useEffect, useState } from "react";
import { setDemoToken, type DemoAccount, demoApi } from "../api/client.ts";

// Role accent colors — these are role-specific and intentionally not in the theme palette
const ROLE_ACCENT: Record<string, string> = {
  super_admin:   "#ef4444",
  manager_admin: "#6366f1",
  user:          "#10b981",
};
const ROLE_LABEL: Record<string, string> = { super_admin: "Big Boss", manager_admin: "Teacher", user: "Student" };
const ROLE_ICON:  Record<string, string> = { super_admin: "admin_panel_settings", manager_admin: "school", user: "person" };

export function LoginPage() {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"user" | "super_admin" | "manager_admin">("user");
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [enteringAs, setEnteringAs] = useState<string | null>(null);

  if (isLoaded && isSignedIn) return <Navigate to="/" replace />;

  useEffect(() => {
    demoApi.getAccounts().then((r) => setDemoAccounts(r.accounts)).catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem("googenie-pending-role", tab);
  }, [tab]);

  async function enterAs(acc: DemoAccount) {
    setEnteringAs(acc.label);
    setDemoToken(acc.token);
    navigate("/inbox");
  }

  const isDark = theme === "dark";
  const accent = ROLE_ACCENT[tab];

  // Clerk appearance mirrors the app's CSS variable values for the active theme
  const clerkAppearance = {
    variables: {
      colorBackground:      isDark ? "#191b22" : "#f3f3f7",
      colorInputBackground: isDark ? "#1d1f26" : "#edeef1",
      colorText:            isDark ? "#e2e2ea" : "#191c1e",
      colorTextSecondary:   isDark ? "#c1c7cf" : "#41474e",
      colorPrimary:         accent,
      colorInputText:       isDark ? "#e2e2ea" : "#191c1e",
      borderRadius:         "12px",
      fontFamily:           "inherit",
      fontSize:             "14px",
    },
    elements: {
      rootBox:                  "w-full",
      card:                     "w-full shadow-none !bg-transparent border-0 p-0",
      header:                   "hidden",
      headerTitle:              "hidden",
      headerSubtitle:           "hidden",
      logoBox:                  "hidden",
      socialButtonsBlockButton: "w-full rounded-xl font-semibold text-sm h-11 transition-all",
      dividerLine:              "!bg-[var(--c-outline-variant)]",
      dividerText:              "!text-[var(--c-outline)]",
      formFieldInput:           "rounded-xl text-sm h-11",
      formFieldLabel:           "text-xs font-medium",
      formButtonPrimary:        "w-full h-11 rounded-xl font-semibold text-sm transition-all hover:opacity-90",
      footerActionLink:         "font-semibold",
      footer:                   "!bg-transparent",
      card__main:               "!p-0",
    },
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: "var(--c-background)" }}>

      {/* Background orbs — use primary color from theme */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[600px] h-[600px] rounded-full -top-40 -left-40 opacity-[0.08] animate-pulse"
          style={{ background: `radial-gradient(circle, ${accent} 0%, transparent 70%)`, filter: "blur(60px)", transition: "background 0.6s ease" }} />
        <div className="absolute w-[500px] h-[500px] rounded-full -bottom-32 -right-32 opacity-[0.06]"
          style={{ background: `radial-gradient(circle, var(--c-primary) 0%, transparent 70%)`, filter: "blur(60px)" }} />
        <div className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: "linear-gradient(var(--c-on-surface) 1px, transparent 1px), linear-gradient(90deg, var(--c-on-surface) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
      </div>

      {/* Theme toggle */}
      <button onClick={toggle} className="btn-ghost absolute top-5 right-5 p-2.5 z-10">
        <span className="material-symbols-outlined text-lg">{isDark ? "light_mode" : "dark_mode"}</span>
      </button>

      {/* Card — same surface as the rest of the app */}
      <div className="relative w-full max-w-[420px] mx-4 rounded-3xl overflow-hidden"
        style={{
          background: "var(--c-surface-container-low)",
          border: "1px solid var(--c-outline-variant)",
          boxShadow: "var(--glass-shadow)",
        }}>

        {/* Top accent bar — shifts color with selected role */}
        <div className="h-[3px] w-full transition-all duration-500"
          style={{ background: `linear-gradient(90deg, ${accent}, ${accent}88)` }} />

        <div className="px-8 pt-8 pb-6">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}>
              <span className="material-symbols-outlined text-sm text-white" style={{ fontVariationSettings: "FILL 1" }}>auto_awesome</span>
            </div>
            <div>
              <h1 className="font-headline text-xl leading-tight" style={{ color: "var(--c-on-surface)" }}>GooGenie</h1>
              <p className="text-[11px]" style={{ color: "var(--c-on-surface-variant)" }}>AI workspace for every team</p>
            </div>
          </div>

          {/* Role selector */}
          <div className="mb-5">
            <p className="section-label mb-2">Sign in as</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { key: "user"          as const, label: "Student",  icon: "person" },
                { key: "manager_admin" as const, label: "Teacher",  icon: "school" },
                { key: "super_admin"   as const, label: "Big Boss", icon: "admin_panel_settings" },
              ]).map((t) => {
                const active = tab === t.key;
                const a = ROLE_ACCENT[t.key];
                return (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className="flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl text-center transition-all duration-200"
                    style={active
                      ? { background: `color-mix(in srgb, ${a} 12%, transparent)`, border: `1.5px solid color-mix(in srgb, ${a} 30%, transparent)`, transform: "scale(1.02)" }
                      : { background: "var(--c-surface-container)", border: "1.5px solid var(--c-outline-variant)" }}>
                    <span className="material-symbols-outlined text-base transition-colors"
                      style={{ color: active ? a : "var(--c-on-surface-variant)", fontVariationSettings: active ? "FILL 1" : "FILL 0" }}>{t.icon}</span>
                    <span className="text-[11px] font-semibold"
                      style={{ color: active ? a : "var(--c-on-surface-variant)" }}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px" style={{ background: "var(--c-outline-variant)" }} />
            <span className="text-[11px]" style={{ color: "var(--c-outline)" }}>continue with Google</span>
            <div className="flex-1 h-px" style={{ background: "var(--c-outline-variant)" }} />
          </div>

          {/* Clerk */}
          <SignIn routing="hash" appearance={clerkAppearance} />
        </div>

        {/* Demo quick access */}
        {demoAccounts.length > 0 && (
          <div className="px-8 pb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px" style={{ background: "var(--c-outline-variant)" }} />
              <span className="text-[11px]" style={{ color: "var(--c-outline)" }}>or demo access</span>
              <div className="flex-1 h-px" style={{ background: "var(--c-outline-variant)" }} />
            </div>
            <div className="flex gap-2">
              {demoAccounts.slice(0, 3).map((acc) => {
                const a = ROLE_ACCENT[acc.role] ?? ROLE_ACCENT.user;
                const isLoading = enteringAs === acc.label;
                return (
                  <button key={acc.label} onClick={() => enterAs(acc)} disabled={!!enteringAs}
                    className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-center transition-all disabled:opacity-50 nimbus-card-hover"
                    style={{ background: `color-mix(in srgb, ${a} 10%, var(--c-surface-container))`, border: `1px solid color-mix(in srgb, ${a} 20%, var(--c-outline-variant))` }}>
                    <span className="material-symbols-outlined text-sm" style={{ color: a, fontVariationSettings: "FILL 1" }}>
                      {isLoading ? "progress_activity" : ROLE_ICON[acc.role] ?? "person"}
                    </span>
                    <span className="text-[10px] font-bold truncate max-w-full px-1" style={{ color: a }}>{acc.label.split(" ")[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

