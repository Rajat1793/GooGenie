import { useEffect, useState, useCallback, Fragment } from "react";
import { managerApi, type PolicyUser, type AuditEvent } from "../../api/client.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { RoleBadge } from "../../components/RoleBadge.tsx";
import { DataState } from "../../components/DataState.tsx";
import { Card } from "../../components/Card.tsx";
import { formatActivity, activityIcon } from "../../lib/formatActivity.ts";

const FEATURE_CATALOG: Array<{ key: string; label: string; icon: string }> = [
  { key: "email_read",     label: "Read Email",        icon: "inbox" },
  { key: "email_write",    label: "Send Email",         icon: "edit" },
  { key: "calendar_read",  label: "View Calendar",      icon: "calendar_month" },
  { key: "calendar_write", label: "Manage Calendar",    icon: "edit_calendar" },
  { key: "ai_summary",     label: "AI Summaries",       icon: "auto_awesome" },
  { key: "ai_compose",     label: "AI Compose",         icon: "draw" },
];

// ── Activity slide-over ───────────────────────────────────────────────────────
function ActivityPanel({ user, onClose }: { user: PolicyUser; onClose: () => void }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    managerApi.getUserActivity(user.id)
      .then((r) => setEvents(r.activity.slice().reverse()))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user.id]);

  return (
    <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-end md:items-center justify-end">
      <div className="glass-panel w-full md:w-[420px] h-[65vh] md:h-[78vh] md:m-6 flex flex-col rounded-t-3xl md:rounded-2xl shadow-2xl">
        <div className="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/40 rounded-t-3xl md:rounded-t-2xl flex-shrink-0">
          <div>
            <p className="font-semibold text-ink-text text-sm">Activity — {user.displayName ?? user.id}</p>
            <p className="text-xs text-on-surface-variant">{user.email}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {loading && (
            <div className="empty-state">
              <span className="material-symbols-outlined animate-spin text-2xl">progress_activity</span>
            </div>
          )}
          {!loading && events.length === 0 && (
            <div className="empty-state text-sm">No activity yet.</div>
          )}
          {events.map((ev, i) => {
            const text = formatActivity(ev.action, ev.metadata);
            const icon = activityIcon(ev.action);
            return (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/60 border border-outline-variant/15">
                <div className="w-7 h-7 rounded-full bg-secondary-container/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-sm text-primary">{icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-ink-text">{text}</p>
                  <p className="text-[10px] text-on-surface-variant mt-0.5">
                    {new Date(ev.at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Feature-access expand row ─────────────────────────────────────────────────
function FeatureExpandRow({
  user,
  onClose,
}: {
  user: PolicyUser;
  onClose: () => void;
}) {
  const [toggles, setToggles] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState<string | null>(null);

  useEffect(() => {
    managerApi.getFeatureAccess(user.id)
      .then((r) => {
        const m = new Map<string, boolean>();
        for (const t of r.feature_access) m.set(t.featureKey, t.isEnabled);
        setToggles(m);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user.id]);

  async function handleToggle(key: string, val: boolean) {
    setMutating(key);
    setToggles((prev) => new Map(prev).set(key, val));
    try {
      const res = await managerApi.setFeatureAccess(user.id, key, val);
      const next = new Map<string, boolean>();
      for (const t of res.feature_access) next.set(t.featureKey, t.isEnabled);
      setToggles(next);
    } catch {
      setToggles((prev) => new Map(prev).set(key, !val));
    } finally {
      setMutating(null);
    }
  }

  return (
    <tr className="bg-surface-container-low/40">
      <td colSpan={5} className="px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest">
            Feature Access — {user.displayName}
          </p>
          <button onClick={onClose} className="btn-ghost text-xs py-1">
            <span className="material-symbols-outlined text-[14px]">close</span>
            Close
          </button>
        </div>
        {loading ? (
          <p className="text-xs text-on-surface-variant">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {FEATURE_CATALOG.map(({ key, label, icon }) => {
              const on = toggles.get(key) ?? false;
              const busy = mutating === key;
              return (
                <button
                  key={key}
                  onClick={() => handleToggle(key, !on)}
                  disabled={busy}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all disabled:opacity-50 cursor-pointer ${
                    on
                      ? "bg-primary/8 border-primary/30 text-primary"
                      : "bg-surface-container border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/50"
                  }`}
                >
                  <span className="material-symbols-outlined text-xl">
                    {busy ? "progress_activity" : icon}
                  </span>
                  <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
                  <span className={`text-[9px] font-semibold uppercase tracking-widest ${on ? "text-primary" : "text-outline"}`}>
                    {on ? "ON" : "OFF"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ManagerTeamPage() {
  const [users, setUsers] = useState<PolicyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [activityUser, setActivityUser] = useState<PolicyUser | null>(null);

  // Bulk controls
  const [bulkFeature, setBulkFeature] = useState("email_read");
  const [bulkEnabled, setBulkEnabled] = useState(true);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
    setBulkMsg(null);
    try {
      const ids = users.map((u) => u.id);
      const res = await managerApi.bulkSetFeatureAccess(ids, bulkFeature, bulkEnabled);
      setBulkMsg({ ok: true, text: `Updated ${res.updated_count} student${res.updated_count === 1 ? "" : "s"}` });
    } catch (e) {
      setBulkMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBulkLoading(false);
    }
  }

  function toggleExpand(userId: string) {
    setExpandedUser((prev) => (prev === userId ? null : userId));
  }

  const enabledCountForUser = (user: PolicyUser) => {
    // Shown lazily via FeatureExpandRow; show "-" until expanded
    return null;
  };
  void enabledCountForUser; // suppress unused warning

  return (
    <div>
      <PageHeader
        title="My Students"
        subtitle="Manage feature access and activity for your enrolled students."
        action={
          <button onClick={load} className="btn-ghost flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Refresh
          </button>
        }
      />

      {/* Bulk action bar */}
      <Card className="mb-6" padded>
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-4">
          Bulk action — apply to whole team
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">
              Feature
            </label>
            <select
              value={bulkFeature}
              onChange={(e) => setBulkFeature(e.target.value)}
              className="input-field w-44 rounded-xl"
            >
              {FEATURE_CATALOG.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
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
              className="input-field w-32 rounded-xl"
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
          <button
            onClick={handleBulk}
            disabled={bulkLoading || users.length === 0}
            className="btn-primary disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">sync</span>
            Apply to all
          </button>
          {bulkMsg && (
            <p className={`text-xs font-medium ${bulkMsg.ok ? "text-primary" : "text-error"}`}>
              {bulkMsg.ok ? "✓" : "✗"} {bulkMsg.text}
            </p>
          )}
        </div>
      </Card>

      {/* Students table */}
      <Card header={<span className="text-sm font-semibold text-ink-text">Team Members</span>} padded={false}>
        <DataState
          loading={loading}
          error={error}
          show={users.length > 0}
          empty="No team members in your scope."
        >
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Features</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <Fragment key={u.id}>
                    <tr
                      className="hover:bg-surface-container-low/50 transition-colors cursor-pointer"
                      onClick={() => toggleExpand(u.id)}
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-semibold text-xs flex-shrink-0">
                            {(u.displayName ?? u.email ?? "?").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-ink-text">{u.displayName ?? "—"}</p>
                            <p className="text-xs text-on-surface-variant">{u.email ?? u.id}</p>
                          </div>
                        </div>
                      </td>
                      <td><RoleBadge role={u.role} /></td>
                      <td>
                        <span className={`badge ${u.isActive ? "badge-success" : "bg-surface-container text-on-surface-variant"}`}>
                          {u.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleExpand(u.id); }}
                          className="btn-ghost text-xs py-1 flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[14px]">toggle_on</span>
                          {expandedUser === u.id ? "Hide" : "Manage"}
                        </button>
                      </td>
                      <td>
                        <button
                          onClick={(e) => { e.stopPropagation(); setActivityUser(u); }}
                          className="btn-ghost text-xs py-1 flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[14px]">history</span>
                          Activity
                        </button>
                      </td>
                    </tr>
                    {expandedUser === u.id && (
                      <FeatureExpandRow
                        key={`${u.id}-features`}
                        user={u}
                        onClose={() => setExpandedUser(null)}
                      />
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </Card>

      {activityUser && (
        <ActivityPanel user={activityUser} onClose={() => setActivityUser(null)} />
      )}
    </div>
  );
}
