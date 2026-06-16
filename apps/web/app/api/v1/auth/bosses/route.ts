import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { listTenantUsersFromDb } from "@googenie/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async () => {
  const bosses = await listTenantUsersFromDb("dev-admin");
  const superAdmins = bosses.filter((u) => u.role === "super_admin");
  return NextResponse.json({
    bosses: superAdmins.map((b) => ({ id: b.id, displayName: b.displayName, email: b.email })),
  });
});
