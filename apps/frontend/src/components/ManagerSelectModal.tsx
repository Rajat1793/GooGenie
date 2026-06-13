/**
 * ManagerSelectModal — shown to new Clerk users who haven't chosen a manager yet.
 * Fetches the list of managers from the DB and stores the selection via API.
 */
import { useEffect, useState } from "react";
import { authApi2 } from "../api/client.ts";

interface Manager {
  id: string;
  displayName: string;
  email: string;
}

interface Props {
  onComplete: () => void;
}

export function ManagerSelectModal({ onComplete }: Props) {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authApi2.managers().then((r) => setManagers(r.managers)).catch(() => setManagers([]));
  }, []);

  async function handleSave() {
    if (!selected) return;
    setSaving(true); setError(null);
    try {
      await authApi2.selectManager(selected);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--c-surface-container-low)", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "color-mix(in srgb, var(--c-primary) 15%, transparent)" }}>
            <span className="material-symbols-outlined" style={{ color: "var(--c-primary)" }}>group</span>
          </div>
          <div>
          <h2 className="font-headline text-xl" style={{ color: "var(--c-on-surface)" }}>Select your teacher</h2>
          <p className="text-xs" style={{ color: "var(--c-on-surface-variant)" }}>This connects you to your teacher so they can view your activity and manage your access.</p>
          </div>
        </div>

        {error && <div className="rounded-xl px-4 py-2 mb-4 text-sm" style={{ background: "var(--c-error-container)", color: "var(--c-error)" }}>{error}</div>}

        {/* Manager list */}
        <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
          {managers.length === 0 && (
            <p className="text-sm text-center py-6" style={{ color: "var(--c-on-surface-variant)" }}>No managers found. You can skip for now.</p>
          )}
          {managers.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelected(m.id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
              style={selected === m.id
                ? { background: "color-mix(in srgb, var(--c-primary) 15%, transparent)", border: "2px solid var(--c-primary)" }
                : { background: "var(--c-surface-container)", border: "2px solid transparent" }}
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: "var(--c-primary-container)", color: "var(--c-on-primary-container)" }}>
                {m.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--c-on-surface)" }}>{m.displayName}</p>
                <p className="text-xs truncate" style={{ color: "var(--c-on-surface-variant)" }}>{m.email}</p>
              </div>
              {selected === m.id && <span className="material-symbols-outlined text-base shrink-0" style={{ color: "var(--c-primary)" }}>check_circle</span>}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onComplete} className="btn-secondary flex-1">Skip for now</button>
          <button
            onClick={handleSave}
            disabled={!selected || saving}
            className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <span className="material-symbols-outlined text-base">save</span>}
            {saving ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
