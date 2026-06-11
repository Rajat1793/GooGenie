import { API_BASE } from "../context/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await AsyncStorage.getItem("googenie_token") ?? "";
  const res = await fetch(`${API_BASE}${path}`, {
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

export interface FeatureToggle {
  tenantId: string;
  userId: string;
  featureKey: string;
  isEnabled: boolean;
}

export const adminApi = {
  getUsers: () => apiFetch<{ users: PolicyUser[] }>("/v1/admin/users"),
  getActivity: (params?: { userId?: string; action?: string }) => {
    const qs = new URLSearchParams();
    if (params?.userId) qs.set("userId", params.userId);
    if (params?.action) qs.set("action", params.action);
    const q = qs.toString();
    return apiFetch<{ activity: AuditEvent[] }>(`/v1/admin/activity${q ? `?${q}` : ""}`);
  },
  updateRole: (userId: string, role: string, reason: string) =>
    apiFetch<{ user: PolicyUser }>(`/v1/admin/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role, reason })
    })
};

export const managerApi = {
  getUsers: () => apiFetch<{ users: PolicyUser[] }>("/v1/manager/users"),
  getUserActivity: (userId: string) =>
    apiFetch<{ activity: AuditEvent[] }>(`/v1/manager/users/${userId}/activity`),
  setFeatureAccess: (userId: string, featureKey: string, isEnabled: boolean) =>
    apiFetch<{ feature_access: FeatureToggle[] }>(
      `/v1/manager/users/${userId}/feature-access`,
      { method: "PATCH", body: JSON.stringify({ feature_key: featureKey, is_enabled: isEnabled }) }
    ),
  bulkSetFeatureAccess: (userIds: string[], featureKey: string, isEnabled: boolean) =>
    apiFetch<{ updated_count: number }>(
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

// Self-service (S2-7)
export const meApi = {
  getFeatures: () => apiFetch<{ features: FeatureToggle[] }>("/v1/me/features"),
  getActivity: () => apiFetch<{ activity: AuditEvent[] }>("/v1/me/activity")
};
