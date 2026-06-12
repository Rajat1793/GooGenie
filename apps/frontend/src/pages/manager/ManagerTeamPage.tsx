import { useClerkReady } from "../../hooks/useClerkReady.ts";
import { useEffect, useState, useCallback } from "react";
import { managerApi, type PolicyUser } from "../../api/client.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { RoleBadge } from "../../components/RoleBadge.tsx";
import { DataState } from "../../components/DataState.tsx";
import { Toggle } from "../../components/Toggle.tsx";

const FEATURE_KEYS = [
  "email_read",
  "email_write",
  "calendar_read",
  "calendar_write",
  "ai_summary",
  "ai_compose"
] as const;

const FEATURE_ICONS: Record<string, string> = {
  email_read: "inbox", email_write: "edit", calendar_read: "calendar_month",
  calendar_write: "edit_calendar", ai_summary: "auto_awesome", ai_compose: "draw"
};

interface UserRowProps {
  user: PolicyUser;
  onViewActivity: (user: PolicyUser) => void;
}

function UserFeatureRow({ user, onViewActivity }: UserRowProps) {
  const [toggles, setToggles] = useState<Map<string, boolean>>(new Map());
  const [initialised, setInitialised] = useState(false);
  const [mutating, setMutating] = useState(false);

  // Load real initial state from backend
  useEffect(() => {
    managerApi.getFeatureAccess(user.id)
      .then((r) => {
        const m = new Map<string, boolean>();
        for (const t of r.feature_access) m.set(t.featureKey, t.isEnabled);
        setToggles(m);
      })
      .catch(console.error)
      .finally(() => setInitialised(true));
  }, [user.id]);

  async function handleToggle(key: string, val: boolean) {
    setMutating(true);
    // Optimistic update
    setToggles((prev) => new Map(prev).set(key, val));
    try {
      const res = await managerApi.setFeatureAccess(user.id, key, val);
      const next = new Map<string, boolean>();
      for (const t of res.feature_access) next.set(t.featureKey, t.isEnabled);
      setToggles(next);
    } catch {
      // Revert on failure
      setToggles((prev) => new Map(prev).set(key, !val));
    } finally {
      setMutating(false);
    }
  }

  const enabledCount = FEATURE_KEYS.filter((k) => toggles.get(k)).length;

  return (
    <div className="glass-panel rounded-2xl overflow-hidden card-hover">
      {/* User header */}
      <div className="px-6 py-4 border-b border-outline-variant/15 flex items-center justify-between bg-gradient-to-r from-surface-container-low/60 to-transparent">
        <div className="flex items-center gap-3">
          <div className="avatar-md">
            {(user.displayName ?? user.email ?? user.id).charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-text">{user.displayName ?? "—"}</p>
            <p className="text-xs text-on-surface-variant">{user.email ?? user.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-on-surface-variant">
            <span className={`w-2 h-2 rounded-full ${enabledCount > 0 ? "bg-primary" : "bg-outline-variant"}`} />
            {initialised ? `${enabledCount}/${FEATURE_KEYS.length} on` : "loading…"}
          </div>
          <RoleBadge role={user.role} />
          <button onClick={() => onViewActivity(user)} className="btn-ghost text-xs">
            <span className="material-symbols-outlined text-[15px]">history</span>
            Activity
          </button>
        </div>
      </div>

      {/* Feature toggles */}
      <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {FEATURE_KEYS.map((key) => {
          const on = toggles.get(key) ?? false;
          return (
            <div
              key={key}
              className={on ? "feature-chip-on" : "feature-chip-off"}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`material-symbols-outlined text-[16px] flex-shrink-0 ${on ? "text-primary" : "text-outline"}`}>
                  {FEATURE_ICONS[key] ?? "toggle_on"}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink-text capitalize truncate">{key.replace(/_/g, " ")}</p>
                  <p className={`text-[10px] ${on ? "text-primary" : "text-outline"}`}>{on ? "on" : "off"}</p>
                </div>
              </div>
              <Toggle
                enabled={on}
                onChange={(v) => handleToggle(key, v)}
                disabled={mutating || !initialised}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityPanel({ user, onClose }: { user: PolicyUser; onClose: () => void }) {
  const [events, setEvents] = useState<Array<{ at: string; action: string; method: string; route: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    managerApi.getUserActivity(user.id)
      .then((r) => setEvents(r.activity.slice().reverse()))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user.id]);

  return (
    <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-end md:items-center justify-end">
      <div className="glass-panel w-full md:w-[400px] h-[65vh] md:h-[75vh] md:m-6 flex flex-col rounded-t-3xl md:rounded-2xl shadow-2xl">
        <div className="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/40 rounded-t-3xl md:rounded-t-2xl">
          <div>
            <p className="font-semibold text-ink-text text-sm">Activity — {user.displayName ?? user.id}</p>
            <p className="text-xs text-on-surface-variant">{user.email}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {loading && <div className="empty-state"><span className="material-symbols-outlined animate-spin text-2xl">progress_activity</span></div>}
          {!loading && events.length === 0 && <div className="empty-state text-sm">No activity yet.</div>}
          {events.map((ev, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/60 border border-outline-variant/15">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-ink-text">{ev.action.replace(/_/g, " ")}</p>
                <p className="text-[10px] text-on-surface-variant mt-0.5">{ev.method} {ev.route}</p>
              </div>
              <p className="text-[10px] text-outline flex-shrink-0">{new Date(ev.at).toLocaleTimeString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ManagerTeamPage() {
  const [users, setUsers] = useState<PolicyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeUser, setActiveUser] = useState<PolicyUser | null>(null);
  const [bulkFeature, setBulkFeature] = useState("email_read");
  const [bulkEnabled, setBulkEnabled] = useState(true);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await managerApi.getUsers();
      setUsers(res.users);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleBulk() {
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const ids = users.map((u) => u.id);
      const res = await managerApi.bulkSetFeatureAccess(ids, bulkFeature, bulkEnabled);
      setBulkResult({ ok: true, msg: `Updated ${res.updated_count} team members` });
    } catch (e) {
      setBulkResult({ ok: false, msg: (e as Error).message });
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="My Team"
        subtitle="Manage feature access and activity for your direct reports."
        action={
          <button onClick={load} className="btn-secondary flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Refresh
          </button>
        }
      />

      {/* Bulk action bar */}
      <div className="glass-panel rounded-2xl p-5 mb-8 border-l-4 border-[#FFEBCC]">
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-4">
          Bulk action — apply to whole team
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="section-label block mb-1.5">Feature</label>
            <select value={bulkFeature} onChange={(e) => setBulkFeature(e.target.value)} className="input-field w-44">
              {FEATURE_KEYS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="section-label block mb-1.5">Set to</label>
            <select value={String(bulkEnabled)} onChange={(e) => setBulkEnabled(e.target.value === "true")} className="input-field w-32">
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
          <button onClick={handleBulk} disabled={bulkLoading || users.length === 0} className="btn-primary disabled:opacity-50">
            <span className="material-symbols-outlined text-[16px]">sync</span>
            Apply to all
          </button>
          {bulkResult && (
            <p className={`text-xs font-medium ${bulkResult.ok ? "text-primary" : "text-error"}`}>
              {bulkResult.ok ? "✓" : "✗"} {bulkResult.msg}
            </p>
          )}
        </div>
      </div>

      <DataState loading={loading} error={error} show={users.length > 0} empty="No team members in your scope.">
        <div className="space-y-5">
          {users.map((u) => (
            <UserFeatureRow key={u.id} user={u} onViewActivity={setActiveUser} />
          ))}
        </div>
      </DataState>

      {activeUser && <ActivityPanel user={activeUser} onClose={() => setActiveUser(null)} />}
    </div>
  );
}

