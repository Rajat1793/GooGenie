import { useClerkReady } from "../../hooks/useClerkReady.ts";
import { useEffect, useState } from "react";
import { adminApi, type PolicyUser, type RoleChangeRecord } from "../../api/client.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { Card } from "../../components/Card.tsx";
import { RoleBadge } from "../../components/RoleBadge.tsx";
import { DataState } from "../../components/DataState.tsx";
import { ROLES } from "../../lib/roles.ts";
import { getErrorMessage } from "../../lib/errors.ts";

interface EditModalProps {
  user: PolicyUser;
  allUsers: PolicyUser[];
  onClose: () => void;
  onSave: (userId: string, role: string, reason: string, managerId?: string) => Promise<void>;
}

function EditModal({ user, allUsers, onClose, onSave }: EditModalProps) {
  const [role, setRole] = useState(user.role);
  const [managerId, setManagerId] = useState(user.managerUserId ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const managers = allUsers.filter((u) => u.id !== user.id && u.isActive);

  async function handleSave() {
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await onSave(user.id, role, reason, managerId || undefined);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/20 backdrop-blur-sm">
      <div className="glass-panel rounded-2xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-headline text-xl text-ink-text">Edit User</h2>
          <button onClick={onClose} className="btn-ghost">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* User info */}
        <div className="flex items-center gap-3 mb-6 p-3 rounded-xl bg-surface-container-low">
          <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-semibold text-sm">
            {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-text">{user.displayName ?? "—"}</p>
            <p className="text-xs text-on-surface-variant">{user.email}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="input-field rounded-xl"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r.replace("_", " ")}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">
              Reports To
            </label>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className="input-field rounded-xl"
            >
              <option value="">— No manager —</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName ?? m.email} ({m.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">
              Reason <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Promotion, reassignment…"
              className="input-field rounded-xl"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !reason.trim()}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<PolicyUser[]>([]);
  const [roleChanges, setRoleChanges] = useState<RoleChangeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PolicyUser | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getUsers();
      setUsers(res.users);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const clerkReady = useClerkReady(); useEffect(() => { if (clerkReady) load(); }, [clerkReady]);

  async function handleSave(userId: string, role: string, reason: string, managerId?: string) {
    const updated = await adminApi.updateRole(userId, role, reason);
    setRoleChanges(updated.role_changes);
    if (managerId !== undefined) {
      await adminApi.updateManager(userId, managerId || undefined);
    }
    await load();
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      (u.email ?? "").toLowerCase().includes(q) ||
      (u.displayName ?? "").toLowerCase().includes(q) ||
      u.role.includes(q) ||
      u.id.includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage roles, hierarchy assignments, and access."
        action={
          <button onClick={load} className="btn-ghost flex items-center gap-1">
            <span className="material-symbols-outlined text-base">refresh</span>
            Refresh
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Stats */}
        {(["super_admin", "manager_admin", "user"] as const).map((r) => {
          const count = users.filter((u) => u.role === r).length;
          return (
            <div key={r} className="glass-panel rounded-2xl p-5 flex items-center gap-4">
              <span className={`material-symbols-outlined text-2xl ${
                r === "super_admin" ? "text-error" : r === "manager_admin" ? "text-tertiary" : "text-primary"
              }`}>
                {r === "super_admin" ? "admin_panel_settings" : r === "manager_admin" ? "manage_accounts" : "person"}
              </span>
              <div>
                <p className="text-2xl font-headline text-ink-text">{count}</p>
                <p className="text-xs text-on-surface-variant uppercase tracking-widest">
                  {r === "super_admin" ? "Big Boss" : r === "manager_admin" ? "Teacher" : "Student"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <Card
        header={
          <>
            <span className="text-sm font-semibold text-ink-text">All Users</span>
            <input
              type="search"
              placeholder="Filter by name, email, role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field w-64 rounded-full py-1.5 text-xs"
            />
          </>
        }
        padded={false}
      >
        <DataState loading={loading} error={error} show={filtered.length > 0} empty="No users found.">
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Teacher</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const manager = users.find((m) => m.id === u.managerUserId);
                  return (
                    <tr key={u.id} className="hover:bg-surface-container-low/50 transition-colors">
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
                      <td className="text-on-surface-variant text-xs">
                        {manager ? (manager.displayName ?? manager.email) : "—"}
                      </td>
                      <td>
                        <button
                          onClick={() => setEditing(u)}
                          className="btn-ghost text-xs py-1"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DataState>
      </Card>

      {/* Role change log */}
      {roleChanges.length > 0 && (
        <Card
          className="mt-6"
          header={<span className="text-sm font-semibold text-ink-text">Recent Role Changes</span>}
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr><th>Target</th><th>Old Role</th><th>New Role</th><th>Reason</th><th>Changed</th></tr>
              </thead>
              <tbody>
                {roleChanges.map((rc, i) => (
                  <tr key={i}>
                    <td className="text-xs">{rc.targetUserId}</td>
                    <td><RoleBadge role={rc.oldRole} /></td>
                    <td><RoleBadge role={rc.newRole} /></td>
                    <td className="text-xs text-on-surface-variant">{rc.reason}</td>
                    <td className="text-xs text-on-surface-variant">{new Date(rc.changedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && (
        <EditModal
          user={editing}
          allUsers={users}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
