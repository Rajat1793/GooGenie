import { NextResponse } from "next/server";
import { withApiMiddleware, createApiError, statusFromApiError, paginate } from "@googenie/server";
import { listAuditEvents } from "@googenie/server/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth, traceId }) => {
  if (auth!.role !== "super_admin") {
    return NextResponse.json(createApiError("FORBIDDEN", "super_admin only", false, traceId), {
      status: statusFromApiError("FORBIDDEN"),
    });
  }
  const url = new URL(req.url);
  const activity = await listAuditEvents(auth!.tenantId, {
    actorUserId: url.searchParams.get("userId") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
  });
  const page = paginate(activity, url.searchParams.get("cursor") ?? undefined, url.searchParams.get("limit") ?? undefined);
  return NextResponse.json({ activity: page.items, total: page.total, next_cursor: page.next_cursor });
});
