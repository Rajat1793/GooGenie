import { useEffect, useState, useCallback } from "react";
import { managerApi, type PolicyUser, type FeatureToggle } from "../../api/client.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { Card } from "../../components/Card.tsx";
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

interface UserRowProps {
  user: PolicyUser;
  onViewActivity: (user: PolicyUser) => void;
}

function UserFeatureRow({ user, onViewActivity }: UserRowProps) {
  const [toggles, setToggles] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(false);

  async function handleToggle(key: string, val: boolean) {
    setLoading(true);
    try {
      const res = await managerApi.setFeatureAccess(user.id, key, val);
      const next = new Map(toggles);
      for (const t of res.feature_access) {
        next.set(t.featureKey, t.isEnabled);
      }
      setToggles(next);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      {/* User header */}
      <div className="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-semibold">
            {(user.displayName ?? user.email ?? user.id).charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-text">{user.displayName ?? "—"}</p>
            <p className="text-xs text-on-surface-variant">{user.email ?? user.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <RoleBadge role={user.role} />
          <button
            onClick={() => onViewActivity(user)}
            className="btn-ghost text-xs"
          >
            <span className="material-symbols-outlined text-base mr-1">history</span>
            Activity
          </button>
        </div>
      </div>

      {/* Feature toggles */}
      <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
        {FEATURE_KEYS.map((key) => (
          <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/10">
            <div>
              <p className="text-xs font-medium text-ink-text">{key.replace("_", " ")}</p>
              <p className="text-xs text-on-surface-variant">{toggles.get(key) ? "enabled" : "disabled"}</p>
            </div>
            <Toggle
              enabled={toggles.get(key) ?? false}
              onChange={(v) => handleToggle(key, v)}
              disabled={loading}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface ActivityPanelProps {
  user: PolicyUser;
  onClose: () => void;
}

function ActivityPanel({ user, onClose }: ActivityPanelProps) {
  const [events, setEvents] = useState<Array<{
    at: string; action: string; method: string; route: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    managerApi.getUserActivity(user.id)
      .then((r) => setEvents(r.activity.slice().reverse()))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-end p-0 md:p-6">
      <div className="glass-panel rounded-2xl w-full md:w-[420px] h-[70vh] flex flex-col shadow-xl">
        <div className="px-6 py-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low/50 rounded-t-2xl">
          <div>
            <h3 className="font-semibold text-ink-text text-sm">User Activity</h3>
            <p className="text-xs text-on-surface-variant">{user.displayName ?? user.id}</p>
          </div>
          <button onClick={onClose} className="btn-ghost">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {loading && (
            <div className="flex justify-center py-10">
              <span className="material-symbols-outlined animate-spin text-2xl text-outline">progress_activity</span>
            </div>
          )}
          {!loading && events.length === 0 && (
            <p className="text-xs text-on-surface-variant text-center py-10">No activity yet.</p>
          )}
          {events.map((ev, i) => (
            <div key={i} className="p-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
              <p className="text-xs font-medium text-ink-text">{ev.action.replace(/_/g, " ")}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{ev.method} {ev.route}</p>
              <p className="text-xs text-outline mt-1">{new Date(ev.at).toLocaleString()}</p>
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
  const [bulkResult, setBulkResult] = useState<string | null>(null);

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
      setBulkResult(`Updated ${res.updated_count} users`);
    } catch (e) {
      setBulkResult((e as Error).message);
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="My Team"
        subtitle="Manage feature access and monitor activity for your direct reports."
        action={
          <button onClick={load} className="btn-ghost flex items-center gap-1">
            <span className="material-symbols-outlined text-base">refresh</span>
            Refresh
          </button>
        }
      />

      {/* Bulk actions */}
      <Card className="mb-8 bg-peach-accent/20">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">
              Feature
            </label>
            <select
              value={bulkFeature}
              onChange={(e) => setBulkFeature(e.target.value)}
              className="input-field rounded-xl text-xs"
            >
              {FEATURE_KEYS.map((k) => (
                <option key={k} value={k}>{k.replace("_", " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">
              Set to
            </label>
            <select
              value={String(bulkEnabled)}
              onChange={(e) => setBulkEnabled(e.target.value === "true")}
              className="input-field rounded-xl text-xs"
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <button
              onClick={handleBulk}
              disabled={bulkLoading || users.length === 0}
              className="btn-primary disabled:opacity-50 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-base">sync</span>
              Apply to All
            </button>
            {bulkResult && (
              <p className="text-xs text-primary">{bulkResult}</p>
            )}
          </div>
        </div>
      </Card>

      <DataState loading={loading} error={error} show={users.length > 0} empty="No team members found in your scope.">
        <div className="space-y-6">
          {users.map((u) => (
            <UserFeatureRow
              key={u.id}
              user={u}
              onViewActivity={setActiveUser}
            />
          ))}
        </div>
      </DataState>

      {activeUser && (
        <ActivityPanel user={activeUser} onClose={() => setActiveUser(null)} />
      )}
    </div>
  );
}
