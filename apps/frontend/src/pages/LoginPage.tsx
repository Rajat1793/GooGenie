import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.tsx";

export function LoginPage() {
  const [token, setInput] = useState("");
  const [error, setError] = useState("");
  const { setToken } = useAuth();
  const navigate = useNavigate();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = token.trim();
    if (!t) { setError("Paste a bearer token to continue."); return; }
    setToken(t);
    navigate("/");
  }

  return (
    <div className="min-h-screen flex">
      {/* Left hero panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-primary px-14 py-16 text-white relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/5" />
          <div className="absolute top-1/2 -left-20 w-72 h-72 rounded-full bg-white/5" />
          <div className="absolute -bottom-20 right-20 w-64 h-64 rounded-full bg-white/5" />
        </div>

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-xl">cloud</span>
          </div>
          <span className="text-2xl font-bold tracking-tight">Googenie</span>
        </div>

        {/* Hero text */}
        <div className="relative space-y-6">
          <h1 className="font-headline text-5xl leading-tight text-white">
            AI-first workspace<br />
            for your whole team
          </h1>
          <p className="text-white/70 text-lg leading-relaxed max-w-sm">
            Role-based access, intelligent email, and calendar — powered by Googenie.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-3 pt-2">
            {["Smart inbox", "Calendar AI", "Team visibility", "Audit logs"].map((f) => (
              <span key={f} className="px-3 py-1.5 bg-white/10 rounded-full text-sm text-white/90 border border-white/20">
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom role hint */}
        <div className="relative flex gap-4">
          {["super_admin", "manager_admin", "user"].map((r) => (
            <div key={r} className="flex items-center gap-2 text-white/60 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
              {r.replace("_", " ")}
            </div>
          ))}
        </div>
      </div>

      {/* Right login panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 bg-[#f0f4f8]">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="font-headline text-3xl text-ink-text mb-2">Sign in</h2>
            <p className="text-sm text-on-surface-variant">Paste your bearer token to access the workspace.</p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="section-label block mb-2">Bearer Token</label>
              <textarea
                value={token}
                onChange={(e) => { setInput(e.target.value); setError(""); }}
                rows={4}
                placeholder="eyJzdWIi..."
                className="input-field font-mono text-xs resize-none"
                autoComplete="off"
                spellCheck={false}
              />
              {error && (
                <p className="mt-1.5 text-xs text-error flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">error</span>
                  {error}
                </p>
              )}
            </div>

            <button type="submit" className="btn-primary w-full py-3 text-base">
              Enter Workspace
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </button>
          </form>

          <p className="mt-8 text-xs text-on-surface-variant/60 text-center leading-relaxed">
            Generate a token with{" "}
            <code className="bg-surface-container px-1.5 py-0.5 rounded text-on-surface">pnpm seed:staging</code>{" "}
            or <code className="bg-surface-container px-1.5 py-0.5 rounded text-on-surface">tsx scripts/gen-tokens.ts</code>
          </p>
        </div>
      </div>
    </div>
  );
}
