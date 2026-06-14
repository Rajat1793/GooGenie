/**
 * Feature-access request helpers (DB-backed).
 *
 * Flow:
 *  - A user (or teacher) creates a request for a feature_key, addressed to
 *    their direct manager (target_manager_user_id).
 *  - The manager approves or denies it. On approval the corresponding row in
 *    user_feature_access is upserted with is_enabled=true.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "./client.js";

export type RequestStatus = "pending" | "approved" | "denied";

export interface FeatureRequestRow {
  id: number;
  tenantId: string;
  requesterUserId: string;
  targetManagerUserId: string;
  featureKey: string;
  status: RequestStatus;
  reason: string | null;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

export async function createFeatureRequest(args: {
  tenantId: string;
  requesterUserId: string;
  targetManagerUserId: string;
  featureKey: string;
  reason?: string;
}): Promise<FeatureRequestRow> {
  const [row] = await db.insert(schema.featureRequests).values({
    tenantId: args.tenantId,
    requesterUserId: args.requesterUserId,
    targetManagerUserId: args.targetManagerUserId,
    featureKey: args.featureKey,
    reason: args.reason ?? null,
    status: "pending",
  }).returning();
  return row as FeatureRequestRow;
}

export async function listOutgoingRequests(requesterUserId: string): Promise<FeatureRequestRow[]> {
  const rows = await db.select()
    .from(schema.featureRequests)
    .where(eq(schema.featureRequests.requesterUserId, requesterUserId))
    .orderBy(desc(schema.featureRequests.createdAt));
  return rows as FeatureRequestRow[];
}

export async function listIncomingRequests(targetManagerUserId: string, status?: RequestStatus): Promise<FeatureRequestRow[]> {
  const where = status
    ? and(eq(schema.featureRequests.targetManagerUserId, targetManagerUserId), eq(schema.featureRequests.status, status))
    : eq(schema.featureRequests.targetManagerUserId, targetManagerUserId);
  const rows = await db.select()
    .from(schema.featureRequests)
    .where(where)
    .orderBy(desc(schema.featureRequests.createdAt));
  return rows as FeatureRequestRow[];
}

/** super_admin only — returns every feature request across all managers. */
export async function listAllRequests(status?: RequestStatus): Promise<FeatureRequestRow[]> {
  const where = status ? eq(schema.featureRequests.status, status) : undefined;
  const rows = await db.select()
    .from(schema.featureRequests)
    .where(where)
    .orderBy(desc(schema.featureRequests.createdAt));
  return rows as FeatureRequestRow[];
}

export async function getFeatureRequest(id: number): Promise<FeatureRequestRow | null> {
  const rows = await db.select().from(schema.featureRequests).where(eq(schema.featureRequests.id, id)).limit(1);
  return (rows[0] as FeatureRequestRow | undefined) ?? null;
}

export async function decideFeatureRequest(args: {
  id: number;
  decidedByUserId: string;
  decision: "approved" | "denied";
}): Promise<FeatureRequestRow | null> {
  const [row] = await db.update(schema.featureRequests)
    .set({
      status: args.decision,
      decidedByUserId: args.decidedByUserId,
      decidedAt: new Date(),
    })
    .where(and(
      eq(schema.featureRequests.id, args.id),
      eq(schema.featureRequests.status, "pending"),
    ))
    .returning();
  if (!row) return null;
  if (args.decision === "approved") {
    // Upsert the feature toggle so the requester gets access immediately.
    await upsertFeatureAccess({
      tenantId: row.tenantId,
      userId: row.requesterUserId,
      featureKey: row.featureKey,
      isEnabled: true,
    });
  }
  return row as FeatureRequestRow;
}

// ── User feature access helpers ──────────────────────────────────────────────
export interface FeatureAccessRow {
  tenantId: string;
  userId: string;
  featureKey: string;
  isEnabled: boolean;
}

export async function listFeatureAccessForUser(tenantId: string, userId: string): Promise<FeatureAccessRow[]> {
  const rows = await db.select({
    tenantId: schema.userFeatureAccess.tenantId,
    userId: schema.userFeatureAccess.userId,
    featureKey: schema.userFeatureAccess.featureKey,
    isEnabled: schema.userFeatureAccess.isEnabled,
  }).from(schema.userFeatureAccess).where(
    and(eq(schema.userFeatureAccess.tenantId, tenantId), eq(schema.userFeatureAccess.userId, userId))
  );
  return rows as FeatureAccessRow[];
}

export async function upsertFeatureAccess(args: FeatureAccessRow): Promise<void> {
  // First try update; if no rows updated, insert.
  const updated = await db.update(schema.userFeatureAccess)
    .set({ isEnabled: args.isEnabled })
    .where(and(
      eq(schema.userFeatureAccess.tenantId, args.tenantId),
      eq(schema.userFeatureAccess.userId, args.userId),
      eq(schema.userFeatureAccess.featureKey, args.featureKey),
    ))
    .returning({ id: schema.userFeatureAccess.id });
  if (updated.length === 0) {
    await db.insert(schema.userFeatureAccess).values(args).onConflictDoNothing();
  }
}

export async function listFeatureAccessForUsers(userIds: string[]): Promise<FeatureAccessRow[]> {
  if (userIds.length === 0) return [];
  const rows = await db.select({
    tenantId: schema.userFeatureAccess.tenantId,
    userId: schema.userFeatureAccess.userId,
    featureKey: schema.userFeatureAccess.featureKey,
    isEnabled: schema.userFeatureAccess.isEnabled,
  }).from(schema.userFeatureAccess).where(inArray(schema.userFeatureAccess.userId, userIds));
  return rows as FeatureAccessRow[];
}
