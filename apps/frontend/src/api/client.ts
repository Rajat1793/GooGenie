/** Base URL for backend API.
 * In dev: Vite proxies /v1 → localhost:4000 so BASE stays empty.
 * In production: VITE_API_URL points to the Render backend service URL.
 */
const BASE = import.meta.env.VITE_API_URL ?? "";

// Clerk token getter — set by ClerkTokenProvider below
let _getToken: (() => Promise<string | null>) | null = null;
export function setClerkTokenGetter(fn: () => Promise<string | null>) { _getToken = fn; }

// Demo token override — bypasses Clerk, set when user clicks a demo account button
let _demoToken: string | null = null;
export function setDemoToken(token: string | null) { _demoToken = token; }
export function getDemoToken() { return _demoToken; }

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Demo token takes priority over Clerk JWT
  const token = _demoToken ?? (_getToken ? await _getToken() : null);
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

// Email / Gmail
export interface EmailThread {
  id: string;
  tenantId: string;
  ownerUserId: string;
  subject: string;
  snippet: string;
  updatedAt: string;
}

export const emailApi = {
  listThreads: (params?: { userId?: string; cursor?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.userId) qs.set("userId", params.userId);
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiFetch<{ threads: EmailThread[]; total: number; next_cursor?: string }>(
      `/v1/email/threads${q ? `?${q}` : ""}`
    );
  },

  getThread: (threadId: string) =>
    apiFetch<{ thread: EmailThread }>(`/v1/email/threads/${threadId}`),

  send: (body: { to: string; subject: string; body: string }) =>
    apiFetch<{ message_id?: string; thread_id?: string }>("/v1/email/messages/send", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  reply: (threadId: string, body: { to: string; subject: string; body: string; message_id?: string }) =>
    apiFetch<{ message_id?: string; thread_id?: string }>(`/v1/email/threads/${threadId}/reply`, {
      method: "POST",
      body: JSON.stringify(body)
    }),

  modifyLabels: (threadId: string, body: { add_label_ids: string[]; remove_label_ids: string[] }) =>
    apiFetch<{ thread_id: string }>(`/v1/email/threads/${threadId}/labels`, {
      method: "PATCH",
      body: JSON.stringify(body)
    })
};

// Calendar / Google Calendar
export interface CalendarEvent {
  id: string;
  tenantId: string;
  ownerUserId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  attendees: string[];
}

export const calendarApi = {
  listEvents: (params?: { userId?: string; timeMin?: string; timeMax?: string; cursor?: string }) => {
    const qs = new URLSearchParams();
    if (params?.userId) qs.set("userId", params.userId);
    if (params?.timeMin) qs.set("timeMin", params.timeMin);
    if (params?.timeMax) qs.set("timeMax", params.timeMax);
    if (params?.cursor) qs.set("cursor", params.cursor);
    const q = qs.toString();
    return apiFetch<{ events: CalendarEvent[]; total: number; next_cursor?: string }>(
      `/v1/calendar/events${q ? `?${q}` : ""}`
    );
  },

  createEvent: (body: { title: string; starts_at: string; ends_at: string; attendees: string[] }) =>
    apiFetch<{ event: CalendarEvent }>("/v1/calendar/events", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateEvent: (eventId: string, body: { title?: string; starts_at?: string; ends_at?: string; attendees?: string[] }) =>
    apiFetch<{ event: CalendarEvent }>(`/v1/calendar/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),

  checkAvailability: (body: { time_min: string; time_max: string; calendar_ids?: string[] }) =>
    apiFetch<{ availability: Array<{ calendarId: string; busy: Array<{ start: string; end: string }> }> }>(
      "/v1/calendar/availability/check",
      { method: "POST", body: JSON.stringify(body) }
    )
};

// Agent
export const agentApi = {
  execute: (prompt: string, context?: Record<string, unknown>) =>
    apiFetch<{ action: string; message: string; suggestions: string[] }>("/v1/agent/execute", {
      method: "POST",
      body: JSON.stringify({ prompt, context })
    })
};

// Demo accounts
export interface DemoAccount {
  role: string;
  label: string;
  description: string;
  email: string;
  token: string;
}
export const demoApi = {
  getAccounts: () =>
    apiFetch<{ accounts: DemoAccount[] }>("/v1/demo/tokens")
};

// Auth (local login + user management via PostgreSQL)
export interface DbUser {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: string;
  managerUserId: string | null;
  isActive: boolean;
}
export const authApi2 = {
  localLogin: (email: string, password: string) =>
    apiFetch<{ token: string; user: DbUser }>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  clerkSync: (email: string, displayName: string) =>
    apiFetch<{ user: DbUser; needsManager: boolean }>("/v1/auth/clerk-sync", {
      method: "POST",
      body: JSON.stringify({ email, displayName })
    }),
  me: () => apiFetch<{ user: DbUser }>("/v1/auth/me"),
  managers: () => apiFetch<{ managers: Array<{ id: string; displayName: string; email: string }> }>("/v1/auth/managers"),
  selectManager: (managerId: string) =>
    apiFetch<{ success: boolean }>("/v1/auth/select-manager", {
      method: "POST",
      body: JSON.stringify({ managerId })
    }),
  team: () => apiFetch<{ team: DbUser[] }>("/v1/auth/team"),
  allUsers: () => apiFetch<{ users: DbUser[] }>("/v1/auth/all-users"),
  orgTree: () => apiFetch<{
    tree: Array<DbUser & { children: Array<DbUser & { children: DbUser[] }> }>;
    unassigned: DbUser[];
    stats: { bigBoss: number; teachers: number; students: number };
  }>("/v1/auth/org-tree"),
};

// Connect / OAuth
export const connectApi = {
  status: () =>
    apiFetch<{ connected: { gmail: boolean; googlecalendar: boolean } }>("/v1/me/connect/status"),

  /** Opens a popup window for the given plugin OAuth flow. Resolves when connected or rejects on error. */
  connectPlugin: async (plugin: "gmail" | "googlecalendar"): Promise<void> => {
    // Step 1: get signed OAuth URL from authenticated backend endpoint
    const { url } = await apiFetch<{ url: string; state: string }>(`/v1/me/connect/${plugin}/init`, { method: "POST" });

    // Step 2: open Google's OAuth URL directly (no backend redirect needed)
    return new Promise((resolve, reject) => {
      const popup = window.open(url, `connect_${plugin}`, "width=500,height=650,left=400,top=100");
      if (!popup) { reject(new Error("Popup blocked — please allow popups for this site")); return; }

      const handler = (e: MessageEvent) => {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type === "CONNECT_SUCCESS" && e.data.plugin === plugin) {
          window.removeEventListener("message", handler);
          resolve();
        } else if (e.data?.type === "CONNECT_ERROR") {
          window.removeEventListener("message", handler);
          reject(new Error(decodeURIComponent(e.data.error ?? "Connection failed")));
        }
      };
      window.addEventListener("message", handler);

      // Fallback: poll until popup closes
      const poll = setInterval(() => {
        if (popup.closed) { clearInterval(poll); window.removeEventListener("message", handler); resolve(); }
      }, 500);
    });
  }
};
