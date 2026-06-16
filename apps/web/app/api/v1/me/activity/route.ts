import { NextResponse } from "next/server";
import { withApiMiddleware, paginate } from "@googenie/server";
import { listAuditEvents } from "@googenie/server/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth }) => {
  const url = new URL(req.url);
  const activity = await listAuditEvents(auth!.tenantId, { actorUserId: auth!.userId });
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = url.searchParams.get("limit") ?? undefined;
  const page = paginate(activity, cursor, limit);
  return NextResponse.json({ activity: page.items, total: page.total, next_cursor: page.next_cursor });
});
