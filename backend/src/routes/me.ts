/// <reference path="../contracts/request.d.ts" />
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware.js";
import { listFeatureTogglesForUser } from "../auth/policy-store.js";
import { listAuditEvents } from "../security/audit.js";
import { emitAuditEvent } from "../security/audit.js";
import { createApiError } from "../security/errors.js";
import { paginate } from "../security/pagination.js";

export const meRouter = Router();

meRouter.get("/profile", requireAuth, (req: Request, res: Response) => {
  const auth = req.auth!;
  emitAuditEvent(req, "me_profile_read");
  res.status(200).json({ id: auth.userId, tenant_id: auth.tenantId, role: auth.role });
});

meRouter.get("/features", requireAuth, (req: Request, res: Response) => {
  const auth = req.auth!;
  const features = listFeatureTogglesForUser(auth.tenantId, auth.userId);
  emitAuditEvent(req, "me_features_read", { count: features.length });
  const page = paginate(
    features,
    typeof req.query.cursor === "string" ? req.query.cursor : undefined,
    typeof req.query.limit === "string" ? req.query.limit : undefined
  );
  res.status(200).json({ features: page.items, total: page.total, next_cursor: page.next_cursor });
});

meRouter.get("/activity", requireAuth, (req: Request, res: Response) => {
  const auth = req.auth!;
  const activity = listAuditEvents(auth.tenantId, { actorUserId: auth.userId });
  emitAuditEvent(req, "me_activity_read", { count: activity.length });
  const page = paginate(
    activity,
    typeof req.query.cursor === "string" ? req.query.cursor : undefined,
    typeof req.query.limit === "string" ? req.query.limit : undefined
  );
  res.status(200).json({ activity: page.items, total: page.total, next_cursor: page.next_cursor });
});

/** requireAuth guard — throws if auth missing (used by routes that inline-check) */
export function assertAuth(req: Request): NonNullable<typeof req.auth> {
  if (!req.auth) throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
  return req.auth;
}
