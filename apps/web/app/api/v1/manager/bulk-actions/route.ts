import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { managerBulkActionSchema } from "@googenie/server/contracts/schemas";
import { getUserById, listDirectReports } from "@googenie/db/users";
import { upsertFeatureAccess } from "@googenie/db/featureRequests";
import { forbidden, notFound } from "../../_lib/scope";
import { requireManagerRole, resolveDbUser } from "../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  if (!requireManagerRole(auth!.role)) return forbidden("Manager or super_admin only", traceId);
  const parsed = await validateBody(managerBulkActionSchema, req, { traceId, message: "Invalid bulk action payload" });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const me = await resolveDbUser(auth!);
  if (!me) return notFound("Manager not found", traceId);

  const reports = await listDirectReports(me.id);
  const allowedIds = new Set([me.id, ...reports.map((r) => r.id)]);

  const denied = body.user_ids.filter((id: string) => !allowedIds.has(id));
  if (denied.length > 0 && auth!.role !== "super_admin") {
    return forbidden("Bulk action contains out-of-scope users", traceId);
  }

  const updated: Array<{ tenantId: string; userId: string; featureKey: string; isEnabled: boolean }> = [];
  for (const userId of body.user_ids) {
    const u = await getUserById(userId);
    if (!u) continue;
    await upsertFeatureAccess({
      tenantId: u.tenantId,
      userId: u.id,
      featureKey: body.payload.feature_key,
      isEnabled: body.payload.is_enabled,
    });
    updated.push({
      tenantId: u.tenantId,
      userId: u.id,
      featureKey: body.payload.feature_key,
      isEnabled: body.payload.is_enabled,
    });
  }

  return NextResponse.json({ action: body.action, updated_count: updated.length, updated });
});
