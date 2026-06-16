import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { listFeatureAccessForUser, listOutgoingRequests } from "@googenie/db/featureRequests";
import { FEATURE_CATALOG } from "../_catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (_req, { auth }) => {
  const me = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  const userId = me?.id ?? auth!.userId;
  const tenantId = me?.tenantId ?? auth!.tenantId;

  const dbToggles = await listFeatureAccessForUser(tenantId, userId);
  const enabledKeys = new Set(dbToggles.filter((t) => t.isEnabled).map((t) => t.featureKey));
  const isAdmin = auth!.role === "super_admin";

  const features = FEATURE_CATALOG.map((f) => ({
    tenantId,
    userId,
    featureKey: f.key,
    label: f.label,
    isEnabled: isAdmin ? true : enabledKeys.has(f.key),
  }));

  const outgoing = me ? await listOutgoingRequests(userId) : [];

  return NextResponse.json({
    features,
    catalog: FEATURE_CATALOG,
    pending_requests: outgoing
      .filter((r) => r.status === "pending")
      .map((r) => ({ id: r.id, feature_key: r.featureKey, status: r.status, created_at: r.createdAt })),
    history: outgoing
      .filter((r) => r.status !== "pending")
      .map((r) => ({ id: r.id, feature_key: r.featureKey, status: r.status, decided_at: r.decidedAt })),
  });
});
