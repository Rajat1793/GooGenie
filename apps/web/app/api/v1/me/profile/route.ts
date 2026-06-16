import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (_req, { auth }) => {
  return NextResponse.json({ id: auth!.userId, tenant_id: auth!.tenantId, role: auth!.role });
});
