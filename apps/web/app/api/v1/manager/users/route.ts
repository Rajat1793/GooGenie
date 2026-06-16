import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { listDirectReports, listAllRoleTenantUsers } from "@googenie/db/users";
import { forbidden } from "../../_lib/scope";
import { requireManagerRole, resolveDbUser } from "../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (_req, { auth, traceId }) => {
  if (!requireManagerRole(auth!.role)) return forbidden("Manager or super_admin only", traceId);

  const me = await resolveDbUser(auth!);
  if (!me) return NextResponse.json({ users: [] });

  const reports = auth!.role === "super_admin"
    ? (await listAllRoleTenantUsers()).filter((u) => u.id !== me.id)
    : await listDirectReports(me.id);
  const users = reports.map((u) => ({
    id: u.id,
    tenantId: u.tenantId,
    role: u.role,
    email: u.email,
    displayName: u.displayName,
    managerUserId: u.managerUserId ?? undefined,
    isActive: u.isActive,
  }));
  return NextResponse.json({ users });
});
