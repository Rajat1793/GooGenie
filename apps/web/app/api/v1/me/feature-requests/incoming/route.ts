import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { listIncomingRequests, listAllRequests } from "@googenie/db/featureRequests";
import { serialiseRequest } from "../_serialise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth }) => {
  try {
    const me = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
    if (!me) return NextResponse.json({ requests: [], pending_count: 0 });

    const status = new URL(req.url).searchParams.get("status");
    const normalizedStatus =
      status === "approved" || status === "denied" || status === "pending" ? status : undefined;
    const rows =
      me.role === "super_admin"
        ? await listAllRequests(normalizedStatus)
        : await listIncomingRequests(me.id, normalizedStatus);

    const requesterIds = [...new Set(rows.map((r) => r.requesterUserId))];
    const requesterMap = new Map<string, { id: string; displayName: string; email: string; role: string }>();
    for (const id of requesterIds) {
      const u = await getUserById(id);
      if (u) requesterMap.set(id, { id: u.id, displayName: u.displayName, email: u.email, role: u.role });
    }

    const pending = rows.filter((r) => r.status === "pending").length;
    return NextResponse.json({
      requests: rows.map((r) => ({ ...serialiseRequest(r), requester: requesterMap.get(r.requesterUserId) ?? null })),
      pending_count: pending,
    });
  } catch (err) {
    console.error("[feature-requests/incoming] DB error", {
      userId: auth!.userId,
      tenantId: auth!.tenantId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ requests: [], pending_count: 0 });
  }
});
