/// <reference path="../contracts/request.d.ts" />
import { Router, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { ROLE } from "../auth/roles.js";
import { assignManager, listRoleChanges, listTenantUsers, updateUserRole } from "../auth/policy-store.js";
import { adminUpdateManagerSchema, adminUpdateRoleSchema } from "../contracts/schemas.js";
import { emitAuditEvent, listAuditEvents } from "../security/audit.js";
import { createApiError } from "../security/errors.js";
import { createRateLimitMiddleware } from "../security/rate-limit.js";
import { paginate } from "../security/pagination.js";

const rateLimit = createRateLimitMiddleware({ windowMs: 60_000, max: 30 });
const guard = [requireAuth, requireRole([ROLE.SUPER_ADMIN]), rateLimit];

export const adminRouter = Router();

adminRouter.get("/users", ...guard, (req: Request, res: Response) => {
  const auth = req.auth!;
  const users = listTenantUsers(auth.tenantId);
  emitAuditEvent(req, "admin_users_list_read", { count: users.length });
  const page = paginate(
    users,
    typeof req.query.cursor === "string" ? req.query.cursor : undefined,
    typeof req.query.limit === "string" ? req.query.limit : undefined
  );
  res.status(200).json({ users: page.items, total: page.total, next_cursor: page.next_cursor });
});

adminRouter.patch("/users/:userId/role", ...guard, (req: Request, res: Response) => {
  const auth = req.auth!;
  const parsed = adminUpdateRoleSchema.safeParse(req.body);
  if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid role update payload", false, req.traceId);

  const updated = updateUserRole({
    tenantId: auth.tenantId,
    targetUserId: req.params.userId,
    newRole: parsed.data.role,
    changedByUserId: auth.userId,
    reason: parsed.data.reason
  });
  if (!updated) throw createApiError("NOT_FOUND", "Target user not found in tenant", false, req.traceId);

  emitAuditEvent(req, "admin_user_role_update", { target_user_id: updated.id, new_role: parsed.data.role, reason: parsed.data.reason });
  res.status(200).json({ user: updated, role_changes: listRoleChanges(auth.tenantId) });
});

adminRouter.patch("/users/:userId/manager", ...guard, (req: Request, res: Response) => {
  const auth = req.auth!;
  const parsed = adminUpdateManagerSchema.safeParse(req.body);
  if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid manager update payload", false, req.traceId);

  const updated = assignManager({ tenantId: auth.tenantId, targetUserId: req.params.userId, managerUserId: parsed.data.manager_user_id });
  if (!updated) throw createApiError("NOT_FOUND", "Target user or manager not found in tenant", false, req.traceId);

  emitAuditEvent(req, "admin_user_manager_update", { target_user_id: updated.id, manager_user_id: parsed.data.manager_user_id ?? null });
  res.status(200).json({ user: updated });
});

adminRouter.get("/activity", ...guard, (req: Request, res: Response) => {
  const auth = req.auth!;
  emitAuditEvent(req, "admin_activity_read");
  const actorUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const action = typeof req.query.action === "string" ? req.query.action : undefined;
  const activity = listAuditEvents(auth.tenantId, { actorUserId, action });
  const page = paginate(
    activity,
    typeof req.query.cursor === "string" ? req.query.cursor : undefined,
    typeof req.query.limit === "string" ? req.query.limit : undefined
  );
  res.status(200).json({ activity: page.items, total: page.total, next_cursor: page.next_cursor });
});
