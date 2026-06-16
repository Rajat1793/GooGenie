import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware, createApiError, statusFromApiError, publish } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { decideFeatureRequest, getFeatureRequest } from "@googenie/db/featureRequests";
import { serialiseRequest } from "../../_serialise";
import { paramString } from "../../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const decideSchema = z.object({ decision: z.enum(["approved", "denied"]) });

export const POST = withApiMiddleware(async (req, { auth, traceId, params }) => {
  const id = Number(paramString(params.id));
  if (!Number.isFinite(id)) {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "Invalid request id", false, traceId), {
      status: statusFromApiError("VALIDATION_ERROR"),
    });
  }
  const parsed = await validateBody(decideSchema, req, { traceId, message: "Invalid decision payload" });
  if (!parsed.ok) return parsed.response;
  const { decision } = parsed.data;

  const me = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  if (!me) {
    return NextResponse.json(createApiError("NOT_FOUND", "User not found", false, traceId), {
      status: statusFromApiError("NOT_FOUND"),
    });
  }

  const existing = await getFeatureRequest(id);
  if (!existing) {
    return NextResponse.json(createApiError("NOT_FOUND", "Request not found", false, traceId), {
      status: statusFromApiError("NOT_FOUND"),
    });
  }
  if (me.role !== "super_admin" && existing.targetManagerUserId !== me.id) {
    return NextResponse.json(
      createApiError("FORBIDDEN", "Only the addressed manager (or super_admin) can decide this request", false, traceId),
      { status: statusFromApiError("FORBIDDEN") }
    );
  }
  if (existing.status !== "pending") {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "Request already decided", false, traceId), {
      status: statusFromApiError("VALIDATION_ERROR"),
    });
  }

  const updated = await decideFeatureRequest({ id, decidedByUserId: me.id, decision });
  if (!updated) {
    return NextResponse.json(createApiError("NOT_FOUND", "Request could not be updated", false, traceId), {
      status: statusFromApiError("NOT_FOUND"),
    });
  }

  const requester = await getUserById(updated.requesterUserId);
  const requesterSseId = requester?.clerkUserId ?? updated.requesterUserId;
  publish({
    kind: "feature.request.decided",
    userId: requesterSseId,
    requestId: updated.id,
    featureKey: updated.featureKey,
    decision,
  });

  return NextResponse.json({ request: serialiseRequest(updated) });
});
