import { SignIn } from "@clerk/react";
import { useAuth as useClerkAuth } from "@clerk/react";
import { Navigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext.tsx";
import { useEffect, useState } from "react";

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
      socialButtonsBlockButton: "w-full rounded-xl font-semibold text-sm h-11 transition-all",
      formFieldInput:           "rounded-xl text-sm h-11",
      formFieldLabel:           "text-xs font-medium",
      formButtonPrimary:        "w-full h-11 rounded-xl font-semibold text-sm transition-all hover:opacity-90",
      footerActionLink:         "font-semibold",
    },
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative"
      style={{ background: "var(--c-background)" }}>

      {/* Theme toggle */}
      <button onClick={toggle} className="btn-ghost absolute top-5 right-5">
        <span className="material-symbols-outlined">{isDark ? "light_mode" : "dark_mode"}</span>
      </button>

      <div className="w-full max-w-[400px] mx-4 flex flex-col items-center gap-5">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "var(--c-primary)" }}>
            <span className="material-symbols-outlined text-base"
              style={{ color: "var(--c-on-primary)", fontVariationSettings: "FILL 1" }}>cloud</span>
          </div>
          <div>
            <h1 className="font-headline text-2xl leading-tight" style={{ color: "var(--c-primary)" }}>GooGenie</h1>
            <p className="text-[10px] uppercase tracking-widest font-semibold"
              style={{ color: "var(--c-on-surface-variant)" }}>AI Workspace</p>
          </div>
        </div>

        {/* Role selector */}
        <div className="w-full">
          <p className="section-label mb-2 text-center">Sign in as</p>
          <div className="grid grid-cols-3 gap-2">
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
        </div>

        {/* Clerk form — renders its own card */}
        <div className="w-full">
          <SignIn routing="hash" appearance={clerkAppearance} />
        </div>
      </div>
    </div>
  );
}

