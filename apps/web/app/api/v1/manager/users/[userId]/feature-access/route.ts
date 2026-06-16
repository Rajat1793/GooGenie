import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { managerFeatureAccessSchema } from "@googenie/server/contracts/schemas";
import { getUserById } from "@googenie/db/users";
import { listFeatureAccessForUser, upsertFeatureAccess } from "@googenie/db/featureRequests";
import { forbidden, notFound } from "../../../../_lib/scope";
import { requireManagerRole, resolveDbUser } from "../../../_helpers";
import { paramString } from "../../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorise(auth: NonNullable<Parameters<typeof withApiMiddleware>[0]> extends never ? never : Awaited<ReturnType<typeof resolveDbUser>>, targetUserId: string) {
  if (!auth) return null;
  return getUserById(targetUserId);
}

export const GET = withApiMiddleware(async (_req, { auth, traceId, params }) => {
  if (!requireManagerRole(auth!.role)) return forbidden("Manager or super_admin only", traceId);
  const userId = paramString(params.userId);
  const me = await resolveDbUser(auth!);
  if (!me) return notFound("Manager not found", traceId);

  const target = await getUserById(userId);
  if (!target) return notFound("Target user not found", traceId);
  if (target.managerUserId !== me.id && auth!.role !== "super_admin") {
    return forbidden("Target user is not in your scope", traceId);
  }
  const dbToggles = await listFeatureAccessForUser(target.tenantId, target.id);
  return NextResponse.json({
    feature_access: dbToggles.map((t) => ({
      tenantId: t.tenantId,
      userId: t.userId,
      featureKey: t.featureKey,
      isEnabled: t.isEnabled,
    })),
  });
});

export const PATCH = withApiMiddleware(async (req, { auth, traceId, params }) => {
  if (!requireManagerRole(auth!.role)) return forbidden("Manager or super_admin only", traceId);
  const userId = paramString(params.userId);
  const parsed = await validateBody(managerFeatureAccessSchema, req, { traceId, message: "Invalid feature access payload" });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const me = await resolveDbUser(auth!);
  if (!me) return notFound("Manager not found", traceId);

  const target = await getUserById(userId);
  if (!target) return notFound("Target user not found", traceId);
  if (target.managerUserId !== me.id && auth!.role !== "super_admin") {
    return forbidden("Target user is not in your scope", traceId);
  }

  await upsertFeatureAccess({
    tenantId: target.tenantId,
    userId: target.id,
    featureKey: body.feature_key,
    isEnabled: body.is_enabled,
  });

  const dbToggles = await listFeatureAccessForUser(target.tenantId, target.id);
  return NextResponse.json({
    feature_access: dbToggles.map((t) => ({
      tenantId: t.tenantId,
      userId: t.userId,
      featureKey: t.featureKey,
      isEnabled: t.isEnabled,
    })),
  });
});
