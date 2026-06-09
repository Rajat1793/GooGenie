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
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="glass-panel rounded-2xl p-10 w-full max-w-md shadow-lg">
        <div className="flex flex-col items-center mb-8">
          <span className="material-symbols-outlined text-primary text-4xl mb-3">cloud</span>
          <h1 className="font-headline text-3xl text-primary tracking-tight">Nimbus</h1>
          <p className="text-sm text-on-surface-variant mt-2 text-center">
            Paste your bearer token to access the workspace.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-2">
              Access Token
            </label>
            <textarea
              value={token}
              onChange={(e) => { setInput(e.target.value); setError(""); }}
              rows={3}
              placeholder="eyJ..."
              className="input-field rounded-xl font-mono text-xs resize-none"
            />
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
          <button type="submit" className="btn-primary w-full justify-center">
            Enter Workspace
          </button>
        </form>

        <p className="text-xs text-on-surface-variant/60 text-center mt-6">
          For local testing, generate a token using{" "}
          <code className="bg-surface-container px-1 rounded">npx tsx</code> as described in the runbook.
        </p>
      </div>
    </div>
  );
}
