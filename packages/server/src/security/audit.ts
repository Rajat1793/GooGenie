/// <reference path="../contracts/request.d.ts" />
import type { Request } from "express";

import { redactSensitive } from "./redaction";

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

// In-memory ring buffer — survives single-process Express boots and gives
// `listAuditEvents()` a synchronous fallback when Postgres is unavailable
// (e.g. unit tests, very early boot). The Postgres `activity_logs` table is
// the source of truth — see `persistAuditEvent()`.
const auditEvents: AuditEvent[] = [];
const MAX_IN_MEMORY = 500;

function pushInMemory(event: AuditEvent) {
  auditEvents.push(event);
  if (auditEvents.length > MAX_IN_MEMORY) auditEvents.splice(0, auditEvents.length - MAX_IN_MEMORY);
}

/**
 * Async write to `activity_logs`. Fire-and-forget — audit must never block or
 * fail a request. We deliberately import the db lazily so `audit.ts` stays
 * usable in environments that don't connect to Postgres (Express tests).
 *
 * The auth context's `userId` is the Clerk subject (`user_xxx`) but the DB
 * stores the user with `clerk_user_xxx` as the primary key (per `users.id`)
 * with `clerk_user_id` as a separate column. We resolve the real DB id
 * before insert so the FK on `actor_user_id` is satisfied.
 */
async function persistAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const [dbMod, usersMod] = await Promise.all([
      import("@googenie/db/client"),
      import("@googenie/db/users"),
    ]);
    const { db, schema } = dbMod;
    const { getUserById, getUserByClerkId } = usersMod;

    const dbUser =
      (await getUserById(event.actor_user_id)) ??
      (await getUserByClerkId(event.actor_user_id));
    if (!dbUser) {
      // User hasn't been synced yet — skip audit row to avoid FK violation.
      // The in-memory ring buffer still has the event for fallback queries.
      return;
    }

    await db.insert(schema.activityLogs).values({
      tenantId: dbUser.tenantId,
      actorUserId: dbUser.id,
      targetUserId: null,
      entityType: "api_route",
      entityId: event.route,
      action: event.action,
      metadataJson: {
        method: event.method,
        role: event.role,
        ...(event.metadata ?? {}),
      },
    });
  } catch {
    // FK violation, DB down, etc. — never break the request.
  }
}

export function emitAuditEvent(req: Request, action: string, metadata?: Record<string, unknown>): void {
  if (!req.auth) {
    return;
  }

  const event: AuditEvent = {
    at: new Date().toISOString(),
    action,
    actor_user_id: req.auth.userId,
    tenant_id: req.auth.tenantId,
    role: req.auth.role,
    route: req.path,
    method: req.method,
    metadata: redactSensitive(metadata ?? {})
  };

  pushInMemory(event);
  void persistAuditEvent(event);

  console.log("[AUDIT]", JSON.stringify(event));
}

/**
 * List recent audit events for a tenant, optionally narrowed by actor /
 * action. Returns most-recent-first. Pulls from Postgres when available and
 * falls back to the in-memory ring buffer otherwise.
 */
export async function listAuditEvents(
  tenantId: string,
  filters?: { actorUserId?: string; action?: string; limit?: number }
): Promise<AuditEvent[]> {
  const limit = Math.min(filters?.limit ?? 200, 500);
  try {
    const [dbMod, usersMod, drizzleOrm] = await Promise.all([
      import("@googenie/db/client"),
      import("@googenie/db/users"),
      import("drizzle-orm"),
    ]);
    const { db, schema } = dbMod;
    const { getUserById, getUserByClerkId } = usersMod;
    const { and, desc, eq } = drizzleOrm;

    // Resolve filter.actorUserId from a Clerk subject to the real DB id.
    let actorDbId = filters?.actorUserId;
    if (actorDbId) {
      const dbUser =
        (await getUserById(actorDbId)) ?? (await getUserByClerkId(actorDbId));
      actorDbId = dbUser?.id ?? actorDbId;
    }

    const conditions = [eq(schema.activityLogs.tenantId, tenantId)];
    if (actorDbId) conditions.push(eq(schema.activityLogs.actorUserId, actorDbId));
    if (filters?.action) conditions.push(eq(schema.activityLogs.action, filters.action));
    const rows = await db
      .select()
      .from(schema.activityLogs)
      .where(and(...conditions))
      .orderBy(desc(schema.activityLogs.createdAt))
      .limit(limit);
    return rows.map((r) => {
      const meta = (r.metadataJson as Record<string, unknown>) ?? {};
      const method = typeof meta.method === "string" ? meta.method : "GET";
      const role = typeof meta.role === "string" ? meta.role : "user";
      const { method: _m, role: _r, ...rest } = meta;
      return {
        at: (r.createdAt as Date).toISOString(),
        action: r.action,
        actor_user_id: r.actorUserId,
        tenant_id: r.tenantId,
        role,
        route: r.entityId,
        method,
        metadata: rest as Record<string, unknown>,
      };
    });
  } catch {
    // Fall back to in-memory list when DB is unavailable (unit tests, etc.)
    return auditEvents
      .filter((event) => {
        if (event.tenant_id !== tenantId) return false;
        if (filters?.actorUserId && event.actor_user_id !== filters.actorUserId) return false;
        if (filters?.action && event.action !== filters.action) return false;
        return true;
      })
      .slice()
      .reverse()
      .slice(0, limit);
  }
}

/**
 * Framework-agnostic emit — used by Next.js Route Handlers via withApiMiddleware.
 * Mirrors emitAuditEvent() but takes plain values instead of an Express req.
 */
export function emitAuditEventRaw(opts: {
  userId: string;
  tenantId: string;
  role: string;
  route: string;
  method: string;
  action: string;
  metadata?: Record<string, unknown>;
}): void {
  const event: AuditEvent = {
    at: new Date().toISOString(),
    action: opts.action,
    actor_user_id: opts.userId,
    tenant_id: opts.tenantId,
    role: opts.role,
    route: opts.route,
    method: opts.method,
    metadata: redactSensitive(opts.metadata ?? {}),
  };
  pushInMemory(event);
  void persistAuditEvent(event);
  console.log("[AUDIT]", JSON.stringify(event));
}
