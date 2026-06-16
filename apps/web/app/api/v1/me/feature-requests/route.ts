import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware, createApiError, statusFromApiError, publish } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { createFeatureRequest } from "@googenie/db/featureRequests";
import { FEATURE_KEYS } from "../_catalog";
import { serialiseRequest } from "./_serialise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createRequestSchema = z.object({
  feature_key: z.enum(FEATURE_KEYS),
  reason: z.string().max(500).optional(),
});

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const parsed = await validateBody(createRequestSchema, req, { traceId, message: "Invalid feature request payload" });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const me = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  if (!me) {
    return NextResponse.json(createApiError("NOT_FOUND", "User not found", false, traceId), { status: statusFromApiError("NOT_FOUND") });
  }
  if (!me.managerUserId) {
    return NextResponse.json(
      createApiError("VALIDATION_ERROR", "You don't have a manager assigned to receive this request.", false, traceId),
      { status: statusFromApiError("VALIDATION_ERROR") }
    );
  }

  const row = await createFeatureRequest({
    tenantId: me.tenantId,
    requesterUserId: me.id,
    targetManagerUserId: me.managerUserId,
    featureKey: body.feature_key,
    reason: body.reason,
  });

  const manager = await getUserById(me.managerUserId);
  const managerSseId = manager?.clerkUserId ?? me.managerUserId;
  publish({
    kind: "feature.request.created",
    userId: managerSseId,
    requestId: row.id,
    featureKey: body.feature_key,
    requesterName: me.displayName ?? me.email,
  });

  return NextResponse.json({ request: serialiseRequest(row) }, { status: 201 });
});
