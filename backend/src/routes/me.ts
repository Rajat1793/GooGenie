/// <reference path="../contracts/request.d.ts" />
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { listAuditEvents } from "../security/audit.js";
import { emitAuditEvent } from "../security/audit.js";
import { createApiError } from "../security/errors.js";
import { paginate } from "../security/pagination.js";
import { getUserById, getUserByClerkId } from "../db/users.js";
import { publish } from "../integrations/event-bus.js";
import {
  createFeatureRequest,
  decideFeatureRequest,
  getFeatureRequest,
  listFeatureAccessForUser,
  listIncomingRequests,
  listAllRequests,
  listOutgoingRequests,
} from "../db/featureRequests.js";

export const meRouter = Router();

/**
 * Canonical feature catalog — used to render the "available features" list
 * on the profile page and to validate request payloads.
 */
const FEATURE_CATALOG: Array<{ key: string; label: string }> = [
  { key: "email_read",     label: "Read Email" },
  { key: "email_write",    label: "Send Email" },
  { key: "calendar_read",  label: "View Calendar" },
  { key: "calendar_write", label: "Manage Calendar" },
  { key: "ai_summary",     label: "AI Summaries" },
  { key: "ai_compose",     label: "AI Compose" },
];
const FEATURE_KEYS = FEATURE_CATALOG.map((f) => f.key) as [string, ...string[]];

meRouter.get("/profile", requireAuth, (req: Request, res: Response) => {
  const auth = req.auth!;
  emitAuditEvent(req, "me_profile_read");
  res.status(200).json({ id: auth.userId, tenant_id: auth.tenantId, role: auth.role });
});

/**
 * Return the user's feature toggles plus the catalog so the UI can render
 * "available but not yet granted" features alongside enabled ones, plus
 * any pending requests the user has open.
 */
meRouter.get("/features", requireAuth, async (req: Request, res: Response) => {
  const auth = req.auth!;
  // Resolve the actual DB row for this caller. For Clerk users our DB id is
  // `clerk_<sub>` (the JWT sub). Auth middleware already sets userId to this id.
  const me = (await getUserById(auth.userId)) ?? (await getUserByClerkId(auth.userId));
  const userId = me?.id ?? auth.userId;
  const tenantId = me?.tenantId ?? auth.tenantId;

  const dbToggles = await listFeatureAccessForUser(tenantId, userId);
  const enabledKeys = new Set(dbToggles.filter((t) => t.isEnabled).map((t) => t.featureKey));

    // super_admin always has every feature enabled (they're the platform owners)
    const isAdmin = auth.role === "super_admin";

    // Project the catalog into the response so the UI sees every feature.
  const features = FEATURE_CATALOG.map((f) => ({
    tenantId,
    userId,
    featureKey: f.key,
    label: f.label,
      isEnabled: isAdmin ? true : enabledKeys.has(f.key),
  }));

  const outgoing = me ? await listOutgoingRequests(userId) : [];

  emitAuditEvent(req, "me_features_read", { count: features.length });
  res.status(200).json({
    features,
    catalog: FEATURE_CATALOG,
    pending_requests: outgoing.filter((r) => r.status === "pending").map((r) => ({
      id: r.id,
      feature_key: r.featureKey,
      status: r.status,
      created_at: r.createdAt,
    })),
    history: outgoing.filter((r) => r.status !== "pending").map((r) => ({
      id: r.id,
      feature_key: r.featureKey,
      status: r.status,
      decided_at: r.decidedAt,
    })),
  });
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

// ── Feature request inbox ────────────────────────────────────────────────────
const createRequestSchema = z.object({
  feature_key: z.enum(FEATURE_KEYS),
  reason: z.string().max(500).optional(),
});

/**
 * Submit a feature-access request. Routed automatically to the requester's
 * direct manager (set during onboarding via /auth/select-manager). Big bosses
 * have no manager, so they receive a validation error.
 */
meRouter.post("/feature-requests", requireAuth, async (req: Request, res: Response) => {
  const auth = req.auth!;
  const parsed = createRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw createApiError("VALIDATION_ERROR", "Invalid feature request payload", false, req.traceId);
  }

  const me = (await getUserById(auth.userId)) ?? (await getUserByClerkId(auth.userId));
  if (!me) throw createApiError("NOT_FOUND", "User not found", false, req.traceId);
  if (!me.managerUserId) {
    throw createApiError("VALIDATION_ERROR", "You don't have a manager assigned to receive this request.", false, req.traceId);
  }

  const row = await createFeatureRequest({
    tenantId: me.tenantId,
    requesterUserId: me.id,
    targetManagerUserId: me.managerUserId,
    featureKey: parsed.data.feature_key,
    reason: parsed.data.reason,
  });

  emitAuditEvent(req, "me_feature_request_created", {
    feature_key: parsed.data.feature_key,
    target_manager_user_id: me.managerUserId,
    request_id: row.id,
  });

  // Push SSE event to the manager's browser immediately — no polling delay.
  // SSE subscribes on the Clerk sub (auth.userId from JWT), NOT the DB id,
  // so we look up the manager's clerkUserId before publishing.
  const manager = await getUserById(me.managerUserId);
  const managerSseId = manager?.clerkUserId ?? me.managerUserId;
  publish({
    kind: "feature.request.created",
    userId: managerSseId,
    requestId: row.id,
    featureKey: parsed.data.feature_key,
    requesterName: me.displayName ?? me.email,
  });

  res.status(201).json({ request: serialiseRequest(row) });
});

/**
 * List requests addressed to the caller (manager view). Default returns all
 * statuses so the UI can show a notification badge for pending and history
 * for decided. Pass ?status=pending to filter.
 */
meRouter.get("/feature-requests/incoming", requireAuth, async (req: Request, res: Response) => {
  const auth = req.auth!;
  try {
    const me = (await getUserById(auth.userId)) ?? (await getUserByClerkId(auth.userId));
    if (!me) {
      res.status(200).json({ requests: [], pending_count: 0 });
      return;
    }

    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const normalizedStatus = status === "approved" || status === "denied" || status === "pending" ? status : undefined;
    // super_admin sees ALL requests across every manager, not just their own
    const rows = me.role === "super_admin"
      ? await listAllRequests(normalizedStatus)
      : await listIncomingRequests(me.id, normalizedStatus);

    // Hydrate requester display info so the UI can show who is asking.
    const requesterIds = [...new Set(rows.map((r) => r.requesterUserId))];
    const requesterMap = new Map<string, { id: string; displayName: string; email: string; role: string }>();
    for (const id of requesterIds) {
      const u = await getUserById(id);
      if (u) requesterMap.set(id, { id: u.id, displayName: u.displayName, email: u.email, role: u.role });
    }

    const pending = rows.filter((r) => r.status === "pending").length;
    res.status(200).json({
      requests: rows.map((r) => ({
        ...serialiseRequest(r),
        requester: requesterMap.get(r.requesterUserId) ?? null,
      })),
      pending_count: pending,
    });
  } catch (err) {
    // Don't 500 the notification bell — it polls every 15s and an empty
    // result is far better UX than a flashing error. Log so we can diagnose.
    console.error("[feature-requests/incoming] DB error", {
      userId: auth.userId,
      tenantId: auth.tenantId,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    res.status(200).json({ requests: [], pending_count: 0 });
  }
});

const decideSchema = z.object({ decision: z.enum(["approved", "denied"]) });

meRouter.post("/feature-requests/:id/decide", requireAuth, async (req: Request, res: Response) => {
  const auth = req.auth!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw createApiError("VALIDATION_ERROR", "Invalid request id", false, req.traceId);

  const parsed = decideSchema.safeParse(req.body);
  if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid decision payload", false, req.traceId);

  const me = (await getUserById(auth.userId)) ?? (await getUserByClerkId(auth.userId));
  if (!me) throw createApiError("NOT_FOUND", "User not found", false, req.traceId);

  const existing = await getFeatureRequest(id);
  if (!existing) throw createApiError("NOT_FOUND", "Request not found", false, req.traceId);
  // super_admin can decide any request; managers can only decide their own
  if (me.role !== "super_admin" && existing.targetManagerUserId !== me.id) {
    throw createApiError("FORBIDDEN", "Only the addressed manager (or super_admin) can decide this request", false, req.traceId);
  }
  if (existing.status !== "pending") {
    throw createApiError("VALIDATION_ERROR", "Request already decided", false, req.traceId);
  }

  const updated = await decideFeatureRequest({
    id,
    decidedByUserId: me.id,
    decision: parsed.data.decision,
  });
  if (!updated) throw createApiError("NOT_FOUND", "Request could not be updated", false, req.traceId);

  emitAuditEvent(req, "me_feature_request_decided", {
    feature_key: updated.featureKey,
    decision: parsed.data.decision,
    request_id: updated.id,
    requester_user_id: updated.requesterUserId,
  });

  // Push SSE event to the requester's browser immediately.
  // SSE subscribes on the Clerk sub (auth.userId from JWT), NOT the DB id.
  const requester = await getUserById(updated.requesterUserId);
  const requesterSseId = requester?.clerkUserId ?? updated.requesterUserId;
  publish({
    kind: "feature.request.decided",
    userId: requesterSseId,
    requestId: updated.id,
    featureKey: updated.featureKey,
    decision: parsed.data.decision,
  });

  res.status(200).json({ request: serialiseRequest(updated) });
});

function serialiseRequest(r: {
  id: number;
  tenantId: string;
  requesterUserId: string;
  targetManagerUserId: string;
  featureKey: string;
  status: string;
  reason: string | null;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: r.id,
    tenant_id: r.tenantId,
    requester_user_id: r.requesterUserId,
    target_manager_user_id: r.targetManagerUserId,
    feature_key: r.featureKey,
    status: r.status,
    reason: r.reason,
    decided_by_user_id: r.decidedByUserId,
    decided_at: r.decidedAt,
    created_at: r.createdAt,
  };
}

/** requireAuth guard — throws if auth missing (used by routes that inline-check) */
export function assertAuth(req: Request): NonNullable<typeof req.auth> {
  if (!req.auth) throw createApiError("UNAUTHORIZED", "Missing auth context", false, req.traceId);
  return req.auth;
}
