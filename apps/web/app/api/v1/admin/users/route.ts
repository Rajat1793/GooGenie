import { NextResponse } from "next/server";
import { withApiMiddleware, createApiError, statusFromApiError, paginate } from "@googenie/server";
import { listAdminScopedUsers, getUserById, getUserByClerkId } from "@googenie/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth, traceId }) => {
  if (auth!.role !== "super_admin") {
    return NextResponse.json(createApiError("FORBIDDEN", "super_admin only", false, traceId), {
      status: statusFromApiError("FORBIDDEN"),
    });
  }

  // Resolve caller → DB user id (auth.userId may be a Clerk subject like "user_xxx").
  const me =
    (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  if (!me) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "Caller not found", false, traceId), {
      status: statusFromApiError("UNAUTHORIZED"),
    });
  }

  // Per-admin isolation: only show users in this admin's subtree
  // (themselves + their teachers + their students), plus unassigned
  // teachers/students that any admin can claim.
  const dbUsers = await listAdminScopedUsers(me.id, { includeOrphans: true });
  const users = dbUsers.map((u) => ({
    id: u.id,
    tenantId: u.tenantId,
    role: u.role,
    email: u.email,
    displayName: u.displayName,
    managerUserId: u.managerUserId ?? undefined,
    isActive: u.isActive,
  }));
  const url = new URL(req.url);
  const page = paginate(users, url.searchParams.get("cursor") ?? undefined, url.searchParams.get("limit") ?? undefined);
  return NextResponse.json({ users: page.items, total: page.total, next_cursor: page.next_cursor });
});
