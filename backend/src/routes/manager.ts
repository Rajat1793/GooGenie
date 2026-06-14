/// <reference path="../contracts/request.d.ts" />
import { Router, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { ROLE } from "../auth/roles.js";
import { managerBulkActionSchema, managerFeatureAccessSchema } from "../contracts/schemas.js";
import { emitAuditEvent } from "../security/audit.js";
import { createApiError } from "../security/errors.js";
import { createRateLimitMiddleware } from "../security/rate-limit.js";
import { getUserById, getUserByClerkId, listDirectReports } from "../db/users.js";
import {
  listFeatureAccessForUser,
  upsertFeatureAccess,
} from "../db/featureRequests.js";

const rateLimit = createRateLimitMiddleware({ windowMs: 60_000, max: 60 });
const guard = [requireAuth, requireRole([ROLE.SUPER_ADMIN, ROLE.MANAGER_ADMIN]), rateLimit];

export const managerRouter = Router();

/**
 * Resolve the caller's actual DB user (works for Clerk and demo tokens).
 */
async function resolveDbUser(auth: NonNullable<Request["auth"]>) {
  return (await getUserById(auth.userId)) ?? (await getUserByClerkId(auth.userId));
}

/**
 * List direct reports from DB. Works across tenants — teacher is in
 * dev-teachers, students are in dev-students but their managerUserId
 * points to the teacher's DB id.
 */
managerRouter.get("/users", ...guard, async (req: Request, res: Response) => {
  const auth = req.auth!;
  emitAuditEvent(req, "manager_users_read");

  const me = await resolveDbUser(auth);
  if (!me) {
    res.status(200).json({ users: [] });
    return;
  }

  const reports = await listDirectReports(me.id);
  const users = reports.map((u) => ({
    id: u.id,
    tenantId: u.tenantId,
    role: u.role,
    email: u.email,
    displayName: u.displayName,
    managerUserId: u.managerUserId ?? undefined,
    isActive: u.isActive,
  }));

  res.status(200).json({ users });
});

managerRouter.get("/users/:userId/activity", ...guard, async (req: Request, res: Response) => {
  emitAuditEvent(req, "manager_user_activity_read", { target_user_id: req.params.userId });
  res.status(200).json({ activity: [], target_user_id: req.params.userId });
});

managerRouter.get("/users/:userId/feature-access", ...guard, async (req: Request, res: Response) => {
  const auth = req.auth!;
  const me = await resolveDbUser(auth);
  if (!me) throw createApiError("NOT_FOUND", "Manager not found", false, req.traceId);

  // Scope check: the requested user must be a direct report.
  const target = await getUserById(req.params.userId);
  if (!target) throw createApiError("NOT_FOUND", "Target user not found", false, req.traceId);
  if (target.managerUserId !== me.id && auth.role !== ROLE.SUPER_ADMIN) {
    throw createApiError("FORBIDDEN", "Target user is not in your scope", false, req.traceId);
  }

  const dbToggles = await listFeatureAccessForUser(target.tenantId, target.id);
  res.status(200).json({
    feature_access: dbToggles.map((t) => ({
      tenantId: t.tenantId,
      userId: t.userId,
      featureKey: t.featureKey,
      isEnabled: t.isEnabled,
    })),
  });
});

managerRouter.patch("/users/:userId/feature-access", ...guard, async (req: Request, res: Response) => {
  const auth = req.auth!;
  const parsed = managerFeatureAccessSchema.safeParse(req.body);
  if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid feature access payload", false, req.traceId);

  const me = await resolveDbUser(auth);
  if (!me) throw createApiError("NOT_FOUND", "Manager not found", false, req.traceId);

  const target = await getUserById(req.params.userId);
  if (!target) throw createApiError("NOT_FOUND", "Target user not found", false, req.traceId);
  if (target.managerUserId !== me.id && auth.role !== ROLE.SUPER_ADMIN) {
    throw createApiError("FORBIDDEN", "Target user is not in your scope", false, req.traceId);
  }

  await upsertFeatureAccess({
    tenantId: target.tenantId,
    userId: target.id,
    featureKey: parsed.data.feature_key,
    isEnabled: parsed.data.is_enabled,
  });

  emitAuditEvent(req, "manager_user_feature_update", {
    target_user_id: target.id,
    feature_key: parsed.data.feature_key,
    is_enabled: parsed.data.is_enabled,
  });

  const dbToggles = await listFeatureAccessForUser(target.tenantId, target.id);
  res.status(200).json({
    feature_access: dbToggles.map((t) => ({
      tenantId: t.tenantId,
      userId: t.userId,
      featureKey: t.featureKey,
      isEnabled: t.isEnabled,
    })),
  });
});

managerRouter.post("/bulk-actions", ...guard, async (req: Request, res: Response) => {
  const auth = req.auth!;
  const parsed = managerBulkActionSchema.safeParse(req.body);
  if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid bulk action payload", false, req.traceId);

  const me = await resolveDbUser(auth);
  if (!me) throw createApiError("NOT_FOUND", "Manager not found", false, req.traceId);

  const reports = await listDirectReports(me.id);
  const allowedIds = new Set([me.id, ...reports.map((r) => r.id)]);

  const denied = parsed.data.user_ids.filter((id) => !allowedIds.has(id));
  if (denied.length > 0 && auth.role !== ROLE.SUPER_ADMIN) {
    throw createApiError("FORBIDDEN", "Bulk action contains out-of-scope users", false, req.traceId);
  }

  const updated: Array<{ tenantId: string; userId: string; featureKey: string; isEnabled: boolean }> = [];
  for (const userId of parsed.data.user_ids) {
    const u = await getUserById(userId);
    if (!u) continue;
    await upsertFeatureAccess({
      tenantId: u.tenantId,
      userId: u.id,
      featureKey: parsed.data.payload.feature_key,
      isEnabled: parsed.data.payload.is_enabled,
    });
    updated.push({
      tenantId: u.tenantId,
      userId: u.id,
      featureKey: parsed.data.payload.feature_key,
      isEnabled: parsed.data.payload.is_enabled,
    });
  }

  emitAuditEvent(req, "manager_bulk_set_feature_access", {
    user_ids: parsed.data.user_ids,
    feature_key: parsed.data.payload.feature_key,
    is_enabled: parsed.data.payload.is_enabled,
    updated_count: updated.length,
  });

  res.status(200).json({ action: parsed.data.action, updated_count: updated.length, updated });
});
