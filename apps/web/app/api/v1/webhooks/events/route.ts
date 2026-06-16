import { NextResponse } from "next/server";
import { withApiMiddleware, createApiError, statusFromApiError } from "@googenie/server";
import { webhookStore } from "@googenie/server/integrations/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (_req, { auth, traceId }) => {
  if (auth!.role !== "super_admin") {
    return NextResponse.json(createApiError("FORBIDDEN", "super_admin only", false, traceId), {
      status: statusFromApiError("FORBIDDEN"),
    });
  }
  const events = webhookStore.list(auth!.tenantId);
  return NextResponse.json({ events, total: events.length });
});
