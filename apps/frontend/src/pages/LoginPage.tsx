import { SignIn } from "@clerk/react";
import { useAuth as useClerkAuth } from "@clerk/react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext.tsx";
import { useEffect, useState } from "react";
import { authApi2, setDemoToken, type DemoAccount, demoApi } from "../api/client.ts";

// Role display labels
const ROLE_LABEL: Record<string, string> = { super_admin: "Big Boss", manager_admin: "Teacher", user: "Student" };
const ROLE_ICON:  Record<string, string> = { super_admin: "admin_panel_settings", manager_admin: "school", user: "person" };
const ROLE_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  super_admin:   { bg: "color-mix(in srgb, var(--c-error) 10%, transparent)",     text: "var(--c-error)",     border: "color-mix(in srgb, var(--c-error) 25%, transparent)" },
  manager_admin: { bg: "color-mix(in srgb, var(--c-primary) 10%, transparent)",   text: "var(--c-primary)",   border: "color-mix(in srgb, var(--c-primary) 25%, transparent)" },
  user:          { bg: "color-mix(in srgb, var(--c-secondary) 10%, transparent)", text: "var(--c-secondary)", border: "color-mix(in srgb, var(--c-secondary) 25%, transparent)" },
};

export function LoginPage() {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"clerk" | "bigboss" | "teacher">("clerk");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [enteringAs, setEnteringAs] = useState<string | null>(null);

  if (isLoaded && isSignedIn) return <Navigate to="/" replace />;

  useEffect(() => {
    demoApi.getAccounts().then((r) => setDemoAccounts(r.accounts)).catch(() => {});
  }, []);

  async function handleLocalLogin(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null); setLoggingIn(true);
    try {
      const { token } = await authApi2.localLogin(email, password);
      setDemoToken(token);
      navigate("/inbox");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Login failed");
    } finally { setLoggingIn(false); }
  }

  async function enterAs(acc: DemoAccount) {
    setEnteringAs(acc.label);
    setDemoToken(acc.token);
    navigate("/inbox");
  }

  const DEFAULT_CREDS: Record<string, { email: string; password: string }> = {
    bigboss: { email: "anirudh@googenie.ai",  password: "SuperAdmin@2024" },
    teacher: { email: "hitesh@googenie.ai",   password: "Hitesh@2024" },
  };

  return (
    <div className="min-h-screen flex" style={{ background: "var(--c-background)" }}>

      {/* ── Left panel ── */}
      <div className="hidden lg:flex flex-col w-[420px] shrink-0 relative overflow-hidden" style={{ background: "var(--c-surface-container-low)" }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-20" style={{ background: "var(--c-primary)", filter: "blur(80px)" }} />
          <div className="absolute -bottom-20 left-20 w-72 h-72 rounded-full opacity-15" style={{ background: "var(--c-tertiary)", filter: "blur(60px)" }} />
        </div>

        {/* Logo */}
        <div className="relative flex items-center gap-3 px-10 py-8">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--c-primary)" }}>
            <span className="material-symbols-outlined text-sm" style={{ color: "var(--c-on-primary)", fontVariationSettings: "FILL 1" }}>cloud</span>
          </div>
          <span className="font-headline text-2xl" style={{ color: "var(--c-primary)" }}>GooGenie</span>
        </div>

        <div className="relative px-10 space-y-4">
          <h1 className="font-headline text-4xl leading-tight" style={{ color: "var(--c-on-surface)" }}>
            AI workspace<br />for every team
          </h1>
          <p className="text-sm" style={{ color: "var(--c-on-surface-variant)" }}>
            Role-based Gmail + Calendar — Big Boss, Teachers & Students.
          </p>

          {/* Role hierarchy legend */}
          <div className="space-y-2 pt-2">
            {[
              { role: "super_admin",   desc: "Full platform control" },
              { role: "manager_admin", desc: "Manage students & features" },
              { role: "user",          desc: "Personal inbox & calendar" },
            ].map(({ role, desc }) => {
              const c = ROLE_COLOR[role];
              return (
                <div key={role} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
                  <span className="material-symbols-outlined text-base" style={{ color: c.text }}>{ROLE_ICON[role]}</span>
                  <div>
                    <p className="text-xs font-bold" style={{ color: c.text }}>{ROLE_LABEL[role]}</p>
                    <p className="text-[11px]" style={{ color: "var(--c-on-surface-variant)" }}>{desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Demo quick-login cards */}
        {demoAccounts.length > 0 && (
          <div className="relative px-10 mt-6 flex-1">
            <p className="section-label mb-3">Quick demo access</p>
            <div className="space-y-2 overflow-y-auto max-h-56">
              {demoAccounts.map((acc) => {
                const c = ROLE_COLOR[acc.role] ?? ROLE_COLOR.user;
                const icon = ROLE_ICON[acc.role] ?? "person";
                const loading = enteringAs === acc.label;
                return (
                  <button key={acc.label} onClick={() => enterAs(acc)} disabled={!!enteringAs}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all disabled:opacity-60"
                    style={{ background: c.bg, border: `1px solid ${c.border}` }}>
                    <span className="material-symbols-outlined text-base shrink-0" style={{ color: c.text }}>
                      {loading ? "progress_activity" : icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold" style={{ color: c.text }}>{acc.label}</p>
                      <p className="text-[11px] truncate" style={{ color: "var(--c-on-surface-variant)" }}>{acc.description.split("—")[0]}</p>
                    </div>
                    <span className="material-symbols-outlined text-sm shrink-0" style={{ color: c.text }}>arrow_forward</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="relative flex gap-4 text-xs px-10 pb-8" style={{ color: "var(--c-on-surface-variant)" }}>
          {["big-boss", "teacher", "student"].map((r) => (
            <div key={r} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--c-primary)", opacity: 0.5 }} />
              {r}
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative">
        <button onClick={toggle} className="absolute top-5 right-5 btn-ghost p-2">
          <span className="material-symbols-outlined text-xl">{theme === "dark" ? "light_mode" : "dark_mode"}</span>
        </button>

        <div className="w-full max-w-md">
          <div className="lg:hidden mb-6 text-center">
            <span className="font-headline text-3xl" style={{ color: "var(--c-primary)" }}>GooGenie</span>
          </div>

          {/* Tabs */}
          <div className="flex rounded-xl p-1 mb-6 gap-1" style={{ background: "var(--c-surface-container-high)" }}>
            {[
              { key: "clerk",   label: "Student / Google" },
              { key: "bigboss", label: "Big Boss" },
              { key: "teacher", label: "Teacher" },
            ].map((t) => (
              <button key={t.key} onClick={() => { setTab(t.key as any); setLocalError(null); setEmail(""); setPassword(""); }}
                className="flex-1 text-xs font-semibold py-2 px-1 rounded-lg transition-all"
                style={tab === t.key
                  ? { background: "var(--c-primary)", color: "var(--c-on-primary)" }
                  : { color: "var(--c-on-surface-variant)" }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Clerk sign-in (Students) */}
          {tab === "clerk" && (
            <SignIn routing="hash" appearance={{ elements: {
              rootBox: "w-full", card: "rounded-2xl shadow-lg w-full",
              headerTitle: "font-headline text-2xl",
              formButtonPrimary: "btn-primary w-full justify-center",
              formFieldInput: "input-field",
            }}} />
          )}

          {/* Local login (Big Boss / Teacher) */}
          {(tab === "bigboss" || tab === "teacher") && (
            <form onSubmit={handleLocalLogin} className="space-y-4">
              <div className="nimbus-card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: tab === "bigboss" ? "color-mix(in srgb, var(--c-error) 12%, transparent)" : "color-mix(in srgb, var(--c-primary) 12%, transparent)" }}>
                    <span className="material-symbols-outlined" style={{ color: tab === "bigboss" ? "var(--c-error)" : "var(--c-primary)" }}>
                      {tab === "bigboss" ? "admin_panel_settings" : "school"}
                    </span>
                  </div>
                  <div>
                    <h2 className="font-headline text-xl" style={{ color: "var(--c-on-surface)" }}>
                      {tab === "bigboss" ? "Big Boss Login" : "Teacher Login"}
                    </h2>
                    <p className="text-xs" style={{ color: "var(--c-on-surface-variant)" }}>
                      {tab === "bigboss" ? "Full platform control · All teachers & students" : "Manage your students · Feature flags · Activity"}
                    </p>
                  </div>
                </div>
                {localError && <div className="rounded-xl px-4 py-2 mb-3 text-sm" style={{ background: "var(--c-error-container)", color: "var(--c-error)" }}>{localError}</div>}
                <div className="space-y-3">
                  <div>
                    <label className="section-label mb-1 block">Email</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder={DEFAULT_CREDS[tab].email} className="input-field" required autoComplete="username" />
                  </div>
                  <div>
                    <label className="section-label mb-1 block">Password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password" className="input-field" required autoComplete="current-password" />
                  </div>
                </div>
                <button type="submit" disabled={loggingIn} className="btn-primary w-full mt-4 justify-center disabled:opacity-50 flex items-center gap-2">
                  {loggingIn ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <span className="material-symbols-outlined text-base">login</span>}
                  {loggingIn ? "Signing in…" : "Sign in"}
                </button>
              </div>
              <button type="button"
                onClick={() => { setEmail(DEFAULT_CREDS[tab].email); setPassword(DEFAULT_CREDS[tab].password); }}
                className="w-full text-xs py-2 rounded-xl transition-all"
                style={{ color: "var(--c-primary)", background: "color-mix(in srgb, var(--c-primary) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--c-primary) 15%, transparent)" }}>
                Auto-fill demo credentials
              </button>

              {/* Teacher quick-select if on teacher tab */}
              {tab === "teacher" && (
                <div className="space-y-2">
                  <p className="section-label text-center">Or log in directly as</p>
                  {[
                    { name: "Hitesh Choudhary", email: "hitesh@googenie.ai", password: "Hitesh@2024" },
                    { name: "Piyush Garg",      email: "piyush@googenie.ai", password: "Piyush@2024" },
                  ].map((t) => (
                    <button key={t.email} type="button"
                      onClick={() => { setEmail(t.email); setPassword(t.password); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all"
                      style={{ background: "color-mix(in srgb, var(--c-primary) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--c-primary) 15%, transparent)" }}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: "var(--c-primary-container)", color: "var(--c-on-primary-container)" }}>
                        {t.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-xs font-bold" style={{ color: "var(--c-primary)" }}>{t.name}</p>
                        <p className="text-[11px]" style={{ color: "var(--c-on-surface-variant)" }}>{t.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
