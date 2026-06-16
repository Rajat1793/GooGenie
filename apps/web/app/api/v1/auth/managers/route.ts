/**
 * GET /api/v1/auth/managers — all manager_admin users (popup selector).
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { listManagers } from "@googenie/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async () => {
  const managers = await listManagers("dev-teachers");
  return NextResponse.json({
    managers: managers.map((m) => ({ id: m.id, displayName: m.displayName, email: m.email })),
  });
});
