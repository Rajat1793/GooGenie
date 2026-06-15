/** Base URL for backend API.
 * In dev: Vite proxies /v1 → localhost:4000 so BASE stays empty.
 * In production: VITE_API_URL points to the Render backend service URL.
 */
const BASE = import.meta.env.VITE_API_URL ?? "";

// Clerk token getter — set by ClerkTokenProvider below
let _getToken: (() => Promise<string | null>) | null = null;
export function setClerkTokenGetter(fn: () => Promise<string | null>) { _getToken = fn; }

// Demo token override — bypasses Clerk, set when user clicks a demo account button
// Persisted in sessionStorage so page refresh doesn't break the demo session
const _SESSION_KEY = "googenie_demo_token";
let _demoToken: string | null = sessionStorage.getItem(_SESSION_KEY);
export function setDemoToken(token: string | null) {
  _demoToken = token;
  if (token) sessionStorage.setItem(_SESSION_KEY, token);
  else sessionStorage.removeItem(_SESSION_KEY);
}
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
    const body = await res.json().catch(() => ({ message: res.statusText }));
    // Attach the HTTP status so React Query's retry callback can inspect it
    // and avoid retrying 429s (which would only make rate-limit exhaustion worse).
    const err = Object.assign(new Error(body.message ?? "Request failed"), { status: res.status });
    throw err;
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
export interface FeatureCatalogEntry {
  key: string;
  label: string;
}

export interface FeatureToggleWithLabel extends FeatureToggle {
  label?: string;
}

export interface FeatureRequest {
  id: number;
  tenant_id: string;
  requester_user_id: string;
  target_manager_user_id: string;
  feature_key: string;
  status: "pending" | "approved" | "denied";
  reason: string | null;
  decided_by_user_id: string | null;
  decided_at: string | null;
  created_at: string;
  requester?: { id: string; displayName: string; email: string; role: string } | null;
}

export const meApi = {
  getFeatures: () =>
    apiFetch<{
      features: FeatureToggleWithLabel[];
      catalog: FeatureCatalogEntry[];
      pending_requests: Array<{ id: number; feature_key: string; status: string; created_at: string }>;
      history: Array<{ id: number; feature_key: string; status: string; decided_at: string | null }>;
    }>("/v1/me/features"),

  getActivity: () =>
    apiFetch<{ activity: AuditEvent[] }>("/v1/me/activity"),

  createFeatureRequest: (featureKey: string, reason?: string) =>
    apiFetch<{ request: FeatureRequest }>("/v1/me/feature-requests", {
      method: "POST",
      body: JSON.stringify({ feature_key: featureKey, reason }),
    }),

  getIncomingFeatureRequests: () =>
    apiFetch<{ requests: FeatureRequest[]; pending_count: number }>("/v1/me/feature-requests/incoming"),

  decideFeatureRequest: (id: number, decision: "approved" | "denied") =>
    apiFetch<{ request: FeatureRequest }>(`/v1/me/feature-requests/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
};

// Email / Gmail
export interface EmailThread {
  id: string;
  tenantId: string;
  ownerUserId: string;
  subject: string;
  snippet: string;
  /** Original HTML body, when available. Render in a sandboxed iframe. */
  bodyHtml?: string;
  from: string;
  updatedAt: string;
  isUnread: boolean;
  labelIds: string[];
}

export const emailApi = {
  listThreads: (params?: { userId?: string; cursor?: string; limit?: number; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.userId) qs.set("userId", params.userId);
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.q) qs.set("q", params.q);
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
    }),

  trash: (threadId: string) =>
    apiFetch<{ success: boolean }>(`/v1/email/threads/${threadId}/trash`, { method: "POST" }),

  untrash: (threadId: string) =>
    apiFetch<{ success: boolean }>(`/v1/email/threads/${threadId}/untrash`, { method: "POST" }),

  batchModify: (ids: string[], add_label_ids: string[], remove_label_ids: string[]) =>
    apiFetch<{ success: boolean }>("/v1/email/messages/batch-modify", {
      method: "POST",
      body: JSON.stringify({ ids, add_label_ids, remove_label_ids })
    }),

  listLabels: () =>
    apiFetch<{ labels: Array<{ id: string; name: string; type: string; threadsUnread?: number }> }>("/v1/email/labels"),

  listDrafts: () =>
    apiFetch<{ drafts: Array<{ id: string; snippet?: string }> }>("/v1/email/drafts"),

  createDraft: (body: { to: string; subject: string; body: string }) =>
    apiFetch<{ draft_id?: string }>("/v1/email/drafts", { method: "POST", body: JSON.stringify(body) }),

  sendDraft: (draftId: string) =>
    apiFetch<{ message_id?: string; thread_id?: string }>(`/v1/email/drafts/${draftId}/send`, { method: "POST" }),

  deleteDraft: (draftId: string) =>
    apiFetch<void>(`/v1/email/drafts/${draftId}`, { method: "DELETE" }),
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
  description?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  /** Google Meet conference link, when the event was created with `with_meet: true`. */
  meetLink?: string;
}

export const calendarApi = {
  listEvents: (params?: { userId?: string; timeMin?: string; timeMax?: string; cursor?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.userId) qs.set("userId", params.userId);
    if (params?.timeMin) qs.set("timeMin", params.timeMin);
    if (params?.timeMax) qs.set("timeMax", params.timeMax);
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.q) qs.set("q", params.q);
    const q = qs.toString();
    return apiFetch<{ events: CalendarEvent[]; total: number; next_cursor?: string }>(
      `/v1/calendar/events${q ? `?${q}` : ""}`
    );
  },

  getEvent: (eventId: string) =>
    apiFetch<{ event: CalendarEvent }>(`/v1/calendar/events/${eventId}`),

  createEvent: (body: { title: string; starts_at: string; ends_at: string; attendees: string[]; description?: string; location?: string; with_meet?: boolean }) =>
    apiFetch<{ event: CalendarEvent }>("/v1/calendar/events", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateEvent: (eventId: string, body: { title?: string; starts_at?: string; ends_at?: string; attendees?: string[]; description?: string; location?: string }) =>
    apiFetch<{ event: CalendarEvent }>(`/v1/calendar/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),

  deleteEvent: (eventId: string) =>
    apiFetch<void>(`/v1/calendar/events/${eventId}`, { method: "DELETE" }),

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

// AI endpoints
export interface AiSummary {
  summary: string;
  key_points: string[];
  action_items: string[];
  sentiment: "positive" | "neutral" | "negative" | "urgent";
  model: string;
  ai_available: boolean;
  hint?: string;
}

export interface AiCompose {
  body: string;
  subject?: string;
  alternatives: string[];
  model?: string;
  ai_available: boolean;
  hint?: string;
}

export const aiApi = {
  summarizeThread: (threadId: string) =>
    apiFetch<AiSummary>("/v1/ai/summarize-thread", {
      method: "POST",
      body: JSON.stringify({ thread_id: threadId }),
    }),

  compose: (args: {
    type: "new" | "reply";
    tone: "professional" | "friendly" | "concise";
    context: string;
    thread_snippet?: string;
    recipient_name?: string;
  }) =>
    apiFetch<AiCompose>("/v1/ai/compose", {
      method: "POST",
      body: JSON.stringify(args),
    }),

  suggestSlots: (args: {
    description: string;
    duration_minutes?: number;
    earliest?: string;
    latest?: string;
  }) =>
    apiFetch<AiSlots>("/v1/ai/suggest-slots", {
      method: "POST",
      body: JSON.stringify(args),
    }),

  searchEmails: (query: string, limit = 10) =>
    apiFetch<AiSearchResults>("/v1/ai/search-emails", {
      method: "POST",
      body: JSON.stringify({ query, limit }),
    }),

  indexEmails: (limit = 50) =>
    apiFetch<{ ai_available: boolean; embeddings_available?: boolean; indexed: number; skipped: number; total: number; hint?: string }>(
      "/v1/ai/index-emails",
      { method: "POST", body: JSON.stringify({ limit }) },
    ),

  agent: (prompt: string, history?: Array<{ role: "user" | "assistant"; content: string }>) =>
    apiFetch<AgentResponse>("/v1/agent/execute", {
      method: "POST",
      body: JSON.stringify({ prompt, history }),
    }),
};

export interface AgentResponse {
  action: string;
  message: string;
  suggestions: string[];
  data?: Record<string, unknown>;
  email_refs?: Array<{ thread_id: string; subject: string; from?: string }>;
  model?: string;
  ai_available: boolean;
}

export interface AiSlot {
  start: string;
  end: string;
  score: number;
  reason: string;
}
export interface AiSlots {
  slots: AiSlot[];
  rationale: string | null;
  searched_window: { start: string; end: string };
  ai_available: boolean;
  cached?: boolean;
}
export interface AiSearchResult {
  thread_id: string;
  subject: string | null;
  snippet: string | null;
  from_addr: string | null;
  similarity: number;
}
export interface AiSearchResults {
  ai_available: boolean;
  embeddings_available?: boolean;
  results: AiSearchResult[];
  hint?: string;
}

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
  clerkSync: (email: string, displayName: string, role?: "super_admin" | "manager_admin" | "user") =>
    apiFetch<{ user: DbUser; needsManager: boolean }>("/v1/auth/clerk-sync", {
      method: "POST",
      body: JSON.stringify({ email, displayName, ...(role ? { role } : {}) })
    }),
  me: () => apiFetch<{ user: DbUser }>("/v1/auth/me"),
  managers: () => apiFetch<{ managers: Array<{ id: string; displayName: string; email: string }> }>("/v1/auth/managers"),
  bosses: () => apiFetch<{ bosses: Array<{ id: string; displayName: string; email: string }> }>("/v1/auth/bosses"),
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
    unassigned_teachers: DbUser[];
    stats: { bigBoss: number; teachers: number; students: number };
  }>("/v1/auth/org-tree"),
};

// Connect / OAuth
export const connectApi = {
  status: () =>
    apiFetch<{ connected: { gmail: boolean; googlecalendar: boolean } }>("/v1/me/connect/status"),

  /**
   * Full-page redirect to Google's OAuth consent. The callback returns to /inbox.
   * Use this for auto-authorization right after Clerk sign-in (no popup, no extra click).
   */
  redirectToConnect: async (plugin: "gmail" | "googlecalendar"): Promise<void> => {
    const { url } = await apiFetch<{ url: string; state: string }>(`/v1/me/connect/${plugin}/init`, { method: "POST" });
    window.location.href = url;
  },

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
