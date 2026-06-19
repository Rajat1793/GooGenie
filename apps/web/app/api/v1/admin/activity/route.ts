import { NextResponse } from "next/server";
import { withApiMiddleware, createApiError, statusFromApiError, paginate } from "@googenie/server";
import { listAuditEvents } from "@googenie/server/security/audit";
import {
  getUserById,
  getUserByClerkId,
  getAdminSubtree,
} from "@googenie/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLE_TENANTS = ["dev-admin", "dev-teachers", "dev-students"] as const;

export const GET = withApiMiddleware(async (req, { auth, traceId }) => {
  if (auth!.role !== "super_admin") {
    return NextResponse.json(createApiError("FORBIDDEN", "super_admin only", false, traceId), {
      status: statusFromApiError("FORBIDDEN"),
    });
  }

  // Resolve caller → DB user id.
  const me =
    (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  if (!me) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "Caller not found", false, traceId), {
      status: statusFromApiError("UNAUTHORIZED"),
    });
  }

  const subtree = await getAdminSubtree(me.id);
  const url = new URL(req.url);
  const actorFilter = url.searchParams.get("userId") ?? undefined;
  const actionFilter = url.searchParams.get("action") ?? undefined;

  // If caller passed an explicit actor filter, make sure it is inside their
  // subtree — otherwise silently return empty rather than leak cross-team data.
  if (actorFilter && !subtree.allIds.has(actorFilter)) {
    return NextResponse.json({ activity: [], total: 0, next_cursor: null });
  }

  // Per-admin isolation: pull events across all three role tenants, then keep
  // only those whose actor lives inside the caller's subtree.
  const batches = await Promise.all(
    ROLE_TENANTS.map((tid) =>
      listAuditEvents(tid, { actorUserId: actorFilter, action: actionFilter }),
    ),
  );
  const merged = batches.flat();
  const allowed = subtree.allIds;
  const scoped = merged
    .filter((event) => event.actor_user_id && allowed.has(event.actor_user_id))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const page = paginate(scoped, url.searchParams.get("cursor") ?? undefined, url.searchParams.get("limit") ?? undefined);
  return NextResponse.json({ activity: page.items, total: page.total, next_cursor: page.next_cursor });
});
