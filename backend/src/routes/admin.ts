/// <reference path="../contracts/request.d.ts" />
import { Router, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { ROLE } from "../auth/roles.js";
import { adminUpdateManagerSchema, adminUpdateRoleSchema } from "../contracts/schemas.js";
import { emitAuditEvent, listAuditEvents } from "../security/audit.js";
import { createApiError } from "../security/errors.js";
import { createRateLimitMiddleware } from "../security/rate-limit.js";
import { paginate } from "../security/pagination.js";
import { listAllRoleTenantUsers, getUserById, setUserManager } from "../db/users.js";
import { db, schema } from "../db/client.js";
import { eq, and } from "drizzle-orm";
import type { Role } from "../auth/roles.js";

const rateLimit = createRateLimitMiddleware({ windowMs: 60_000, max: 30 });
const guard = [requireAuth, requireRole([ROLE.SUPER_ADMIN]), rateLimit];

export const adminRouter = Router();

adminRouter.get("/users", ...guard, async (req: Request, res: Response) => {
  const dbUsers = await listAllRoleTenantUsers();
  const users = dbUsers.map((u) => ({
    id: u.id,
    tenantId: u.tenantId,
    role: u.role,
    email: u.email,
    displayName: u.displayName,
    managerUserId: u.managerUserId ?? undefined,
    isActive: u.isActive,
  }));
  emitAuditEvent(req, "admin_users_list_read", { count: users.length });
  const page = paginate(
    users,
    typeof req.query.cursor === "string" ? req.query.cursor : undefined,
    typeof req.query.limit === "string" ? req.query.limit : undefined
  );
  res.status(200).json({ users: page.items, total: page.total, next_cursor: page.next_cursor });
});

// ── PATCH /admin/users/:userId/role ──────────────────────────────────────────
// Updates role + tenant in the DB (policy-store is in-memory only for seed data)
adminRouter.patch("/users/:userId/role", ...guard, async (req: Request, res: Response) => {
  const auth = req.auth!;
  const parsed = adminUpdateRoleSchema.safeParse(req.body);
  if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid role update payload", false, req.traceId);

  const target = await getUserById(req.params.userId);
  if (!target) throw createApiError("NOT_FOUND", "Target user not found", false, req.traceId);

  const ROLE_TENANT: Record<string, string> = {
    super_admin: "dev-admin",
    manager_admin: "dev-teachers",
    user: "dev-students",
  };
  const newTenantId = ROLE_TENANT[parsed.data.role] ?? target.tenantId;

  // Move user to the correct tenant and update role in the DB
  await db.update(schema.users)
    .set({ role: parsed.data.role as Role, tenantId: newTenantId, updatedAt: new Date() })
    .where(eq(schema.users.id, target.id));

  // Record the role change in the DB log
  await db.insert(schema.roleChangeLogs).values({
    tenantId: newTenantId,
    changedByUserId: auth.userId.startsWith("clerk_") ? auth.userId : `clerk_${auth.userId}`,
    targetUserId: target.id,
    oldRole: target.role,
    newRole: parsed.data.role,
    reason: parsed.data.reason,
  }).catch(() => null); // non-fatal if changedByUserId not in DB yet

  const updated = await getUserById(target.id);
  emitAuditEvent(req, "admin_user_role_update", { target_user_id: target.id, new_role: parsed.data.role, reason: parsed.data.reason });
  res.status(200).json({ user: updated, role_changes: [] });
});

// ── PATCH /admin/users/:userId/manager ───────────────────────────────────────
adminRouter.patch("/users/:userId/manager", ...guard, async (req: Request, res: Response) => {
  const parsed = adminUpdateManagerSchema.safeParse(req.body);
  if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid manager update payload", false, req.traceId);

  const target = await getUserById(req.params.userId);
  if (!target) throw createApiError("NOT_FOUND", "Target user not found", false, req.traceId);

  if (parsed.data.manager_user_id) {
    await setUserManager(target.id, parsed.data.manager_user_id);
  } else {
    await db.update(schema.users)
      .set({ managerUserId: null, updatedAt: new Date() })
      .where(eq(schema.users.id, target.id));
  }

  const updated = await getUserById(target.id);
  emitAuditEvent(req, "admin_user_manager_update", { target_user_id: target.id, manager_user_id: parsed.data.manager_user_id ?? null });
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
