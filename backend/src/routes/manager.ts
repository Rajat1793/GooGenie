/// <reference path="../contracts/request.d.ts" />
import { Router, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { ROLE } from "../auth/roles.js";
import { requireUserScope, getScopedUserIds } from "../auth/scope.js";
import { listFeatureTogglesForUser, listTenantUsers, setFeatureToggle } from "../auth/policy-store.js";
import { managerBulkActionSchema, managerFeatureAccessSchema } from "../contracts/schemas.js";
import { emitAuditEvent } from "../security/audit.js";
import { createApiError } from "../security/errors.js";
import { createRateLimitMiddleware } from "../security/rate-limit.js";

const rateLimit = createRateLimitMiddleware({ windowMs: 60_000, max: 60 });
const guard = [requireAuth, requireRole([ROLE.SUPER_ADMIN, ROLE.MANAGER_ADMIN]), rateLimit];

export const managerRouter = Router();

managerRouter.get("/users", ...guard, (req: Request, res: Response) => {
  const auth = req.auth!;
  emitAuditEvent(req, "manager_users_read");
  const scopedUserIds = getScopedUserIds(req);
  const users = listTenantUsers(auth.tenantId).filter((u) => scopedUserIds.has(u.id));
  res.status(200).json({ users });
});

managerRouter.get("/users/:userId/activity", ...guard, requireUserScope((req) => req.params.userId), (req: Request, res: Response) => {
  emitAuditEvent(req, "manager_user_activity_read", { target_user_id: req.params.userId });
  res.status(200).json({ activity: [], target_user_id: req.params.userId });
});

managerRouter.get("/users/:userId/feature-access", ...guard, requireUserScope((req) => req.params.userId), (req: Request, res: Response) => {
  const auth = req.auth!;
  res.status(200).json({ feature_access: listFeatureTogglesForUser(auth.tenantId, req.params.userId) });
});

managerRouter.patch("/users/:userId/feature-access", ...guard, requireUserScope((req) => req.params.userId), (req: Request, res: Response) => {
  const auth = req.auth!;
  const parsed = managerFeatureAccessSchema.safeParse(req.body);
  if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid feature access payload", false, req.traceId);

  const toggle = setFeatureToggle({ tenantId: auth.tenantId, userId: req.params.userId, featureKey: parsed.data.feature_key, isEnabled: parsed.data.is_enabled });
  if (!toggle) throw createApiError("NOT_FOUND", "Target user not found in tenant", false, req.traceId);

  emitAuditEvent(req, "manager_user_feature_update", { target_user_id: req.params.userId, feature_key: parsed.data.feature_key, is_enabled: parsed.data.is_enabled });
  res.status(200).json({ feature_access: listFeatureTogglesForUser(auth.tenantId, req.params.userId) });
});

managerRouter.post("/bulk-actions", ...guard, (req: Request, res: Response) => {
  const auth = req.auth!;
  const parsed = managerBulkActionSchema.safeParse(req.body);
  if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid bulk action payload", false, req.traceId);

  const scopedUsers = getScopedUserIds(req);
  const denied = parsed.data.user_ids.filter((id) => !scopedUsers.has(id));
  if (denied.length > 0) throw createApiError("FORBIDDEN", "Bulk action contains out-of-scope users", false, req.traceId);

  const updated = parsed.data.user_ids
    .map((userId) => setFeatureToggle({ tenantId: auth.tenantId, userId, featureKey: parsed.data.payload.feature_key, isEnabled: parsed.data.payload.is_enabled }))
    .filter((v): v is NonNullable<typeof v> => Boolean(v));

  emitAuditEvent(req, "manager_bulk_set_feature_access", { user_ids: parsed.data.user_ids, feature_key: parsed.data.payload.feature_key, is_enabled: parsed.data.payload.is_enabled, updated_count: updated.length });
  res.status(200).json({ action: parsed.data.action, updated_count: updated.length, updated });
});
