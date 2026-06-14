/**
 * ManagerSelectModal — shown to new Clerk users who haven't chosen a manager yet.
 * - Students select a Teacher
 * - Teachers select a Big Boss
 * Fetches the appropriate list and stores the selection via API.
 */
import { useEffect, useState } from "react";
import { authApi2 } from "../api/client.ts";
import { useAuth } from "../context/AuthContext.tsx";

interface Person {
  id: string;
  displayName: string;
  email: string;
}

interface Props {
  onComplete: () => void;
}

export function ManagerSelectModal({ onComplete }: Props) {
  const { role } = useAuth();
  const isTeacher = role === "manager_admin";

  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isTeacher) {
      // Teachers pick a Big Boss
      authApi2.bosses().then((r) => setPeople(r.bosses)).catch(() => setPeople([]));
    } else {
      // Students pick a Teacher
      authApi2.managers().then((r) => setPeople(r.managers)).catch(() => setPeople([]));
    }
  }, [isTeacher]);

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

  const title = isTeacher ? "Select your Big Boss" : "Select your teacher";
  const subtitle = isTeacher
    ? "Link yourself to a Big Boss so you appear correctly in the organisation chart."
    : "This connects you to your teacher so they can view your activity and manage your access.";
  const emptyMsg = isTeacher
    ? "No Big Boss accounts found. You can skip for now."
    : "No teachers found. You can skip for now.";
  const iconColor = isTeacher ? "var(--c-error)" : "var(--c-primary)";
  const iconBg = isTeacher
    ? "color-mix(in srgb, var(--c-error) 15%, transparent)"
    : "color-mix(in srgb, var(--c-primary) 15%, transparent)";
  const icon = isTeacher ? "admin_panel_settings" : "school";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--c-surface-container-low)", border: "1px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: iconBg }}>
            <span className="material-symbols-outlined" style={{ color: iconColor }}>{icon}</span>
          </div>
          <div>
            <h2 className="font-headline text-xl" style={{ color: "var(--c-on-surface)" }}>{title}</h2>
            <p className="text-xs" style={{ color: "var(--c-on-surface-variant)" }}>{subtitle}</p>
          </div>
        </div>

        {error && <div className="rounded-xl px-4 py-2 mb-4 text-sm" style={{ background: "var(--c-error-container)", color: "var(--c-error)" }}>{error}</div>}

        {/* Person list */}
        <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
          {people.length === 0 && (
            <p className="text-sm text-center py-6" style={{ color: "var(--c-on-surface-variant)" }}>{emptyMsg}</p>
          )}
          {people.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
              style={selected === p.id
                ? { background: `color-mix(in srgb, ${iconColor} 12%, transparent)`, border: `2px solid ${iconColor}` }
                : { background: "var(--c-surface-container)", border: "2px solid transparent" }}
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{ background: isTeacher ? "var(--c-error-container)" : "var(--c-primary-container)", color: isTeacher ? "var(--c-on-error-container)" : "var(--c-on-primary-container)" }}>
                {p.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--c-on-surface)" }}>{p.displayName}</p>
                <p className="text-xs truncate" style={{ color: "var(--c-on-surface-variant)" }}>{p.email}</p>
              </div>
              {selected === p.id && <span className="material-symbols-outlined text-base shrink-0" style={{ color: iconColor }}>check_circle</span>}
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
