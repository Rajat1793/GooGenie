import { NextResponse } from "next/server";
import { withApiMiddleware, createApiError, statusFromApiError, paginate } from "@googenie/server";
import { listAuditEvents } from "@googenie/server/security/audit";
import { listAllRoleTenantUsers } from "@googenie/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth, traceId }) => {
  if (auth!.role !== "super_admin") {
    return NextResponse.json(createApiError("FORBIDDEN", "super_admin only", false, traceId), {
      status: statusFromApiError("FORBIDDEN"),
    });
  }
  const dbUsers = await listAllRoleTenantUsers();
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
