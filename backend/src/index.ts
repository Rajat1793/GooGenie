/// <reference path="./contracts/request.d.ts" />
import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";

import { requireAuth, requireRole, attachTraceId } from "./auth/middleware.js";
import { requireFeature } from "./auth/feature-gate.js";
import { ALL_ROLES, ROLE } from "./auth/roles.js";
import { requireUserScope, resolveAllowedUserIds } from "./auth/scope.js";
import {
  assignManager,
  listFeatureTogglesForUser,
  listRoleChanges,
  listTenantUsers,
  setFeatureToggle,
  updateUserRole
} from "./auth/policy-store.js";
import type { ApiError } from "./contracts/api-error.js";
import { createCalendarEvent, listCalendarEvents } from "./domain/calendar-store.js";
import { getEmailThreadById, listEmailThreads } from "./domain/email-store.js";
import { emitAuditEvent, listAuditEvents } from "./security/audit.js";
import { env } from "./security/env.js";
import { createApiError, statusFromApiError } from "./security/errors.js";
import { idempotency } from "./security/idempotency.js";
import { recordRequest, getCounters, getLatency, evaluateAlerts, resetMetrics } from "./security/metrics.js";
import { paginate } from "./security/pagination.js";
import { createRateLimitMiddleware } from "./security/rate-limit.js";
import { secureHeaders } from "./security/secure-headers.js";

export const app = express();
app.disable("x-powered-by");
app.use(attachTraceId);
app.use(secureHeaders);
app.use(cors());
app.use(express.json({ limit: "64kb" }));
app.use(idempotency);

// S4-3: request timing → metrics
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    recordRequest({ durationMs: Date.now() - start, statusCode: res.statusCode, wasAuthz: Boolean(req.auth), wasGranted: res.statusCode < 400 });
  });
  next();
});

const adminRateLimit = createRateLimitMiddleware({ windowMs: 60_000, max: 30 });
const managerRateLimit = createRateLimitMiddleware({ windowMs: 60_000, max: 60 });

const adminUpdateRoleSchema = z.object({
  role: z.enum([ROLE.SUPER_ADMIN, ROLE.MANAGER_ADMIN, ROLE.USER]),
  reason: z.string().min(3).max(200).default("admin update")
});

const adminUpdateManagerSchema = z.object({
  manager_user_id: z.string().min(1).optional()
});

const createCalendarEventSchema = z.object({
  title: z.string().min(3),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  attendees: z.array(z.string().email()).default([])
});

const managerFeatureAccessSchema = z.object({
  feature_key: z.string().min(3).max(64),
  is_enabled: z.boolean()
});

const managerBulkActionSchema = z.object({
  action: z.enum(["set_feature_access"]),
  user_ids: z.array(z.string().min(1)).min(1),
  payload: z.object({
    feature_key: z.string().min(3).max(64),
    is_enabled: z.boolean()
  })
});

function getScopedUserIds(req: Request): Set<string> {
  const auth = req.auth;
  if (!auth) {
    throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
  }

  const scoped = resolveAllowedUserIds(auth);
  scoped.add(auth.userId);
  return scoped;
}

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "googenie-backend", roles: ALL_ROLES });
});

// S4-3: metrics + alerts (no auth — monitoring agents)
app.get("/v1/metrics", (_req: Request, res: Response) => {
  res.status(200).json({ counters: getCounters(), latency: getLatency(), collected_at: new Date().toISOString() });
});

app.get("/v1/alerts", (_req: Request, res: Response) => {
  const alerts = evaluateAlerts();
  const status = alerts.some((a) => a.status === "critical") ? "critical" : alerts.some((a) => a.status === "warn") ? "warn" : "ok";
  res.status(200).json({ status, alerts });
});

app.post("/v1/metrics/reset", (_req: Request, res: Response) => {
  if (env.NODE_ENV === "production") { res.status(403).json({ message: "Not available in production" }); return; }
  resetMetrics();
  res.status(200).json({ reset: true });
});

/**
 * S3-3: Token lifecycle configuration — no auth required.
 * Web and mobile clients fetch this on startup to configure their token refresh logic.
 */
app.get("/v1/auth/config", (_req: Request, res: Response) => {
  res.status(200).json({
    token_type: "Bearer",
    algorithm: "HMAC-SHA256",
    access_token_ttl_seconds: 3600,
    refresh_token_ttl_seconds: 604800,   // 7 days
    refresh_window_seconds: 300,          // refresh when < 5 min remaining
    clock_skew_tolerance_seconds: 30,
    roles: ALL_ROLES,
    scopes: ["email_read", "email_write", "calendar_read", "calendar_write", "ai_summary", "ai_compose"]
  });
});

app.get("/v1/me/profile", requireAuth, (req: Request, res: Response) => {
  const auth = req.auth;
  if (!auth) {
    throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
  }

  emitAuditEvent(req, "me_profile_read");
  res.status(200).json({
    id: auth.userId,
    tenant_id: auth.tenantId,
    role: auth.role
  });
});

app.get("/v1/me/features", requireAuth, (req: Request, res: Response) => {
  const auth = req.auth;
  if (!auth) {
    throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
  }

  const features = listFeatureTogglesForUser(auth.tenantId, auth.userId);
  emitAuditEvent(req, "me_features_read", { count: features.length });
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = typeof req.query.limit === "string" ? req.query.limit : undefined;
  const page = paginate(features, cursor, limit);
  res.status(200).json({ features: page.items, total: page.total, next_cursor: page.next_cursor });
});

app.get("/v1/me/activity", requireAuth, (req: Request, res: Response) => {
  const auth = req.auth;
  if (!auth) {
    throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
  }

  const activity = listAuditEvents(auth.tenantId, { actorUserId: auth.userId });
  emitAuditEvent(req, "me_activity_read", { count: activity.length });
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = typeof req.query.limit === "string" ? req.query.limit : undefined;
  const page = paginate(activity, cursor, limit);
  res.status(200).json({ activity: page.items, total: page.total, next_cursor: page.next_cursor });
});

app.get(
  "/v1/admin/activity",
  requireAuth,
  requireRole([ROLE.SUPER_ADMIN]),
  adminRateLimit,
  (req: Request, res: Response) => {
    emitAuditEvent(req, "admin_activity_read");
    const auth = req.auth;
    if (!auth) {
      throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
    }

    const actorUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const activity = listAuditEvents(auth.tenantId, { actorUserId, action });
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit = typeof req.query.limit === "string" ? req.query.limit : undefined;
    const page = paginate(activity, cursor, limit);
    res.status(200).json({ activity: page.items, total: page.total, next_cursor: page.next_cursor });
  }
);

app.get(
  "/v1/admin/users",
  requireAuth,
  requireRole([ROLE.SUPER_ADMIN]),
  adminRateLimit,
  (req: Request, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
    }

    const users = listTenantUsers(auth.tenantId);
    emitAuditEvent(req, "admin_users_list_read", { count: users.length });
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit = typeof req.query.limit === "string" ? req.query.limit : undefined;
    const page = paginate(users, cursor, limit);
    res.status(200).json({ users: page.items, total: page.total, next_cursor: page.next_cursor });
  }
);

app.patch(
  "/v1/admin/users/:userId/role",
  requireAuth,
  requireRole([ROLE.SUPER_ADMIN]),
  adminRateLimit,
  (req: Request, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
    }

    const parsed = adminUpdateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createApiError("VALIDATION_ERROR", "Invalid role update payload", false, req.traceId);
    }

    const updated = updateUserRole({
      tenantId: auth.tenantId,
      targetUserId: req.params.userId,
      newRole: parsed.data.role,
      changedByUserId: auth.userId,
      reason: parsed.data.reason
    });

    if (!updated) {
      throw createApiError("NOT_FOUND", "Target user not found in tenant", false, req.traceId);
    }

    emitAuditEvent(req, "admin_user_role_update", {
      target_user_id: updated.id,
      new_role: parsed.data.role,
      reason: parsed.data.reason
    });

    res.status(200).json({ user: updated, role_changes: listRoleChanges(auth.tenantId) });
  }
);

app.patch(
  "/v1/admin/users/:userId/manager",
  requireAuth,
  requireRole([ROLE.SUPER_ADMIN]),
  adminRateLimit,
  (req: Request, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
    }

    const parsed = adminUpdateManagerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createApiError("VALIDATION_ERROR", "Invalid manager update payload", false, req.traceId);
    }

    const updated = assignManager({
      tenantId: auth.tenantId,
      targetUserId: req.params.userId,
      managerUserId: parsed.data.manager_user_id
    });

    if (!updated) {
      throw createApiError("NOT_FOUND", "Target user or manager not found in tenant", false, req.traceId);
    }

    emitAuditEvent(req, "admin_user_manager_update", {
      target_user_id: updated.id,
      manager_user_id: parsed.data.manager_user_id ?? null
    });

    res.status(200).json({ user: updated });
  }
);

app.get(
  "/v1/manager/users",
  requireAuth,
  requireRole([ROLE.SUPER_ADMIN, ROLE.MANAGER_ADMIN]),
  managerRateLimit,
  (req: Request, res: Response) => {
    emitAuditEvent(req, "manager_users_read");
    const auth = req.auth;
    if (!auth) {
      throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
    }

    const scopedUserIds = getScopedUserIds(req);
    const users = listTenantUsers(auth.tenantId).filter((user) => scopedUserIds.has(user.id));
    res.status(200).json({ users });
  }
);

app.get(
  "/v1/manager/users/:userId/activity",
  requireAuth,
  requireRole([ROLE.SUPER_ADMIN, ROLE.MANAGER_ADMIN]),
  managerRateLimit,
  requireUserScope((req) => req.params.userId),
  (req: Request, res: Response) => {
    emitAuditEvent(req, "manager_user_activity_read", { target_user_id: req.params.userId });
    res.status(200).json({ activity: [], target_user_id: req.params.userId });
  }
);

app.get(
  "/v1/manager/users/:userId/feature-access",
  requireAuth,
  requireRole([ROLE.SUPER_ADMIN, ROLE.MANAGER_ADMIN]),
  managerRateLimit,
  requireUserScope((req) => req.params.userId),
  (req: Request, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
    }
    const features = listFeatureTogglesForUser(auth.tenantId, req.params.userId);
    res.status(200).json({ feature_access: features });
  }
);

app.patch(
  "/v1/manager/users/:userId/feature-access",
  requireAuth,
  requireRole([ROLE.SUPER_ADMIN, ROLE.MANAGER_ADMIN]),
  managerRateLimit,
  requireUserScope((req) => req.params.userId),
  (req: Request, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
    }

    const parsed = managerFeatureAccessSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createApiError("VALIDATION_ERROR", "Invalid feature access payload", false, req.traceId);
    }

    const toggle = setFeatureToggle({
      tenantId: auth.tenantId,
      userId: req.params.userId,
      featureKey: parsed.data.feature_key,
      isEnabled: parsed.data.is_enabled
    });

    if (!toggle) {
      throw createApiError("NOT_FOUND", "Target user not found in tenant", false, req.traceId);
    }

    emitAuditEvent(req, "manager_user_feature_update", {
      target_user_id: req.params.userId,
      feature_key: parsed.data.feature_key,
      is_enabled: parsed.data.is_enabled
    });

    res.status(200).json({
      feature_access: listFeatureTogglesForUser(auth.tenantId, req.params.userId)
    });
  }
);

app.post(
  "/v1/manager/bulk-actions",
  requireAuth,
  requireRole([ROLE.SUPER_ADMIN, ROLE.MANAGER_ADMIN]),
  managerRateLimit,
  (req: Request, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
    }

    const parsed = managerBulkActionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createApiError("VALIDATION_ERROR", "Invalid bulk action payload", false, req.traceId);
    }

    const scopedUsers = getScopedUserIds(req);
    const deniedUserIds = parsed.data.user_ids.filter((userId) => !scopedUsers.has(userId));
    if (deniedUserIds.length > 0) {
      throw createApiError("FORBIDDEN", "Bulk action contains out-of-scope users", false, req.traceId);
    }

    const updated = parsed.data.user_ids
      .map((userId) =>
        setFeatureToggle({
          tenantId: auth.tenantId,
          userId,
          featureKey: parsed.data.payload.feature_key,
          isEnabled: parsed.data.payload.is_enabled
        })
      )
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    emitAuditEvent(req, "manager_bulk_set_feature_access", {
      user_ids: parsed.data.user_ids,
      feature_key: parsed.data.payload.feature_key,
      is_enabled: parsed.data.payload.is_enabled,
      updated_count: updated.length
    });

    res.status(200).json({
      action: parsed.data.action,
      updated_count: updated.length,
      updated
    });
  }
);

app.get("/v1/email/threads", requireAuth, requireFeature("email_read"), (req: Request, res: Response) => {
  const auth = req.auth;
  if (!auth) {
    throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
  }

  const requestedUserId = typeof req.query.userId === "string" ? req.query.userId : auth.userId;
  const scopedUserIds = getScopedUserIds(req);
  if (!scopedUserIds.has(requestedUserId)) {
    throw createApiError("FORBIDDEN", "Requested user is out of scope", false, req.traceId);
  }

  const threads = listEmailThreads(auth.tenantId, new Set([requestedUserId]));
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = typeof req.query.limit === "string" ? req.query.limit : undefined;
  const page = paginate(threads, cursor, limit);
  emitAuditEvent(req, "email_threads_read", { requested_user_id: requestedUserId, count: threads.length });
  res.status(200).json({ threads: page.items, total: page.total, next_cursor: page.next_cursor });
});

app.get(
  "/v1/email/threads/:threadId",
  requireAuth,
  requireFeature("email_read"),
  (req: Request, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
    }

    const thread = getEmailThreadById(auth.tenantId, req.params.threadId, getScopedUserIds(req));
    if (!thread) {
      throw createApiError("NOT_FOUND", "Thread not found in tenant scope", false, req.traceId);
    }

    emitAuditEvent(req, "email_thread_read", { thread_id: thread.id });
    res.status(200).json({ thread });
  }
);

app.get("/v1/calendar/events", requireAuth, requireFeature("calendar_read"), (req: Request, res: Response) => {
  const auth = req.auth;
  if (!auth) {
    throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
  }

  const requestedUserId = typeof req.query.userId === "string" ? req.query.userId : auth.userId;
  const scopedUserIds = getScopedUserIds(req);
  if (!scopedUserIds.has(requestedUserId)) {
    throw createApiError("FORBIDDEN", "Requested user is out of scope", false, req.traceId);
  }

  const events = listCalendarEvents(auth.tenantId, new Set([requestedUserId]));
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = typeof req.query.limit === "string" ? req.query.limit : undefined;
  const page = paginate(events, cursor, limit);
  emitAuditEvent(req, "calendar_events_read", { requested_user_id: requestedUserId, count: events.length });
  res.status(200).json({ events: page.items, total: page.total, next_cursor: page.next_cursor });
});

app.post("/v1/calendar/events", requireAuth, requireFeature("calendar_write"), (req: Request, res: Response) => {
  const auth = req.auth;
  if (!auth) {
    throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
  }

  const parsed = createCalendarEventSchema.safeParse(req.body);
  if (!parsed.success) {
    throw createApiError("VALIDATION_ERROR", "Invalid calendar event payload", false, req.traceId);
  }

  const created = createCalendarEvent({
    tenantId: auth.tenantId,
    ownerUserId: auth.userId,
    title: parsed.data.title,
    startsAt: parsed.data.starts_at,
    endsAt: parsed.data.ends_at,
    attendees: parsed.data.attendees
  });

  emitAuditEvent(req, "calendar_event_create", { event_id: created.id });
  res.status(201).json({ event: created });
});

app.use((_req: Request, _res: Response, next: NextFunction) => {
  const error: ApiError = createApiError("NOT_FOUND", "Route not found", false, _req.traceId);
  next(error);
});

app.use((err: ApiError, _req: Request, res: Response, _next: NextFunction) => {
  const status = statusFromApiError(err.code);
  res.status(status).json(err);
});

const port = env.PORT;
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`Googenie backend listening on port ${port}`);
  });
}
