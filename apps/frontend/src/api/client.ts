/** Base URL for backend API. Vite proxies /v1 to localhost:4000 in dev. */
const BASE = "";

// Clerk token getter — set by ClerkTokenProvider below
let _getToken: (() => Promise<string | null>) | null = null;
export function setClerkTokenGetter(fn: () => Promise<string | null>) { _getToken = fn; }

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = _getToken ? await _getToken() : null;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? "Request failed");
  }

  return res.json() as Promise<T>;
}

export interface PolicyUser {
  id: string;
  tenantId: string;
  email?: string;
  displayName?: string;
  role: "super_admin" | "manager_admin" | "user";
  managerUserId?: string;
  isActive: boolean;
}

export interface FeatureToggle {
  tenantId: string;
  userId: string;
  featureKey: string;
  isEnabled: boolean;
}

export interface AuditEvent {
  at: string;
  action: string;
  actor_user_id: string;
  tenant_id: string;
  role: string;
  route: string;
  method: string;
  metadata?: Record<string, unknown>;
}

export interface RoleChangeRecord {
  changedByUserId: string;
  targetUserId: string;
  tenantId: string;
  oldRole: string;
  newRole: string;
  reason: string;
  changedAt: string;
}

// Admin APIs
export const adminApi = {
  getUsers: () => apiFetch<{ users: PolicyUser[] }>("/v1/admin/users"),

  updateRole: (userId: string, role: string, reason: string) =>
    apiFetch<{ user: PolicyUser; role_changes: RoleChangeRecord[] }>(
      `/v1/admin/users/${userId}/role`,
      { method: "PATCH", body: JSON.stringify({ role, reason }) }
    ),

  updateManager: (userId: string, manager_user_id?: string) =>
    apiFetch<{ user: PolicyUser }>(
      `/v1/admin/users/${userId}/manager`,
      { method: "PATCH", body: JSON.stringify({ manager_user_id }) }
    ),

  getActivity: (params?: { userId?: string; action?: string }) => {
    const qs = new URLSearchParams();
    if (params?.userId) qs.set("userId", params.userId);
    if (params?.action) qs.set("action", params.action);
    const q = qs.toString();
    return apiFetch<{ activity: AuditEvent[] }>(`/v1/admin/activity${q ? `?${q}` : ""}`);
  }
};

// Manager APIs
export const managerApi = {
  getUsers: () => apiFetch<{ users: PolicyUser[] }>("/v1/manager/users"),

  getFeatureAccess: (userId: string) =>
    apiFetch<{ feature_access: FeatureToggle[] }>(
      `/v1/manager/users/${userId}/feature-access`
    ),

  getUserActivity: (userId: string) =>
    apiFetch<{ activity: AuditEvent[]; target_user_id: string }>(
      `/v1/manager/users/${userId}/activity`
    ),

  setFeatureAccess: (userId: string, featureKey: string, isEnabled: boolean) =>
    apiFetch<{ feature_access: FeatureToggle[] }>(
      `/v1/manager/users/${userId}/feature-access`,
      { method: "PATCH", body: JSON.stringify({ feature_key: featureKey, is_enabled: isEnabled }) }
    ),

  bulkSetFeatureAccess: (userIds: string[], featureKey: string, isEnabled: boolean) =>
    apiFetch<{ action: string; updated_count: number; updated: FeatureToggle[] }>(
      "/v1/manager/bulk-actions",
      {
        method: "POST",
        body: JSON.stringify({
          action: "set_feature_access",
          user_ids: userIds,
          payload: { feature_key: featureKey, is_enabled: isEnabled }
        })
      }
    )
};

// Auth
export const authApi = {
  getProfile: () =>
    apiFetch<{ id: string; tenant_id: string; role: string }>("/v1/me/profile")
};

// Self-service (S2-7)
export const meApi = {
  getFeatures: () =>
    apiFetch<{ features: FeatureToggle[] }>("/v1/me/features"),

  getActivity: () =>
    apiFetch<{ activity: AuditEvent[] }>("/v1/me/activity")
};
