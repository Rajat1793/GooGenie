import { SignIn } from "@clerk/react";
import { useAuth as useClerkAuth } from "@clerk/react";
import { Navigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext.tsx";
import { useEffect, useState } from "react";

// Role accent colors — role-specific identity, not part of the theme palette
const ROLE_ACCENT: Record<string, string> = {
  super_admin:   "var(--c-error)",
  manager_admin: "var(--c-primary)",
  user:          "var(--c-secondary)",
};
const ROLE_ICON: Record<string, string> = {
  super_admin: "admin_panel_settings",
  manager_admin: "school",
  user: "person",
};

export function LoginPage() {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const { theme, toggle } = useTheme();
  const [tab, setTab] = useState<"user" | "super_admin" | "manager_admin">("user");

  if (isLoaded && isSignedIn) return <Navigate to="/" replace />;

  useEffect(() => {
    localStorage.setItem("googenie-pending-role", tab);
  }, [tab]);

  const isDark = theme === "dark";

  const clerkAppearance = {
    variables: {
      colorBackground:      isDark ? "#191b22" : "#f3f3f7",
      colorInputBackground: isDark ? "#1d1f26" : "#edeef1",
      colorText:            isDark ? "#e2e2ea" : "#191c1e",
      colorTextSecondary:   isDark ? "#c1c7cf" : "#41474e",
      colorPrimary:         isDark ? "#b2dbff" : "#2b6389",
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
      dividerText:              "!text-[var(--c-outline)] text-xs",
      formFieldInput:           "rounded-xl text-sm h-11",
      formFieldLabel:           "text-xs font-medium",
      formButtonPrimary:        "w-full h-11 rounded-xl font-semibold text-sm transition-all hover:opacity-90",
      footerActionLink:         "font-semibold",
      footer:                   "!bg-transparent",
      card__main:               "!p-0",
    },
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative"
      style={{ background: "var(--c-background)" }}>

      {/* Subtle ambient glow — same primary as sidebar */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[500px] h-[500px] rounded-full -top-48 -left-48 opacity-[0.06]"
          style={{ background: "radial-gradient(circle, var(--c-primary) 0%, transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute w-[400px] h-[400px] rounded-full -bottom-32 -right-32 opacity-[0.04]"
          style={{ background: "radial-gradient(circle, var(--c-tertiary) 0%, transparent 70%)", filter: "blur(80px)" }} />
      </div>

      {/* Theme toggle — same as Shell bottom toggle */}
      <button onClick={toggle} className="btn-ghost absolute top-5 right-5">
        <span className="material-symbols-outlined">{isDark ? "light_mode" : "dark_mode"}</span>
        <span className="text-sm">{isDark ? "Light mode" : "Dark mode"}</span>
      </button>

      {/* Login card — uses exact same surface + border as sidebar */}
      <div className="relative w-full max-w-[420px] mx-4 rounded-2xl overflow-hidden"
        style={{
          background: "var(--c-surface-container-low)",
          border: "1px solid var(--c-outline-variant)",
          boxShadow: "var(--glass-shadow)",
        }}>

        {/* Logo — identical to Shell sidebar logo */}
        <div className="flex items-center gap-3 px-7 pt-7 pb-5"
          style={{ borderBottom: "1px solid var(--c-outline-variant)" }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "var(--c-primary)" }}>
            <span className="material-symbols-outlined text-sm"
              style={{ color: "var(--c-on-primary)", fontVariationSettings: "FILL 1" }}>cloud</span>
          </div>
          <div>
            <h1 className="font-headline text-xl leading-tight" style={{ color: "var(--c-primary)" }}>GooGenie</h1>
            <p className="text-[10px] uppercase tracking-widest font-semibold"
              style={{ color: "var(--c-on-surface-variant)" }}>AI Workspace</p>
          </div>
        </div>

        <div className="px-7 pt-5 pb-7">
          {/* Role selector */}
          <p className="section-label mb-3">Sign in as</p>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {([
              { key: "user"          as const, label: "Student",  icon: "person" },
              { key: "manager_admin" as const, label: "Teacher",  icon: "school" },
              { key: "super_admin"   as const, label: "Big Boss", icon: "admin_panel_settings" },
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
                  <span className="material-symbols-outlined text-[18px]"
                    style={{ fontVariationSettings: active ? "FILL 1" : "FILL 0" }}>{t.icon}</span>
                  <span className="text-[11px] font-semibold">{t.label}</span>
                </button>
              );
            })}
          </div>

          <SignIn routing="hash" appearance={clerkAppearance} />
        </div>
      </div>
    </div>
  );
}

