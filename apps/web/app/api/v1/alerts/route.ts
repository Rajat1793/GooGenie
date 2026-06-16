import { NextResponse } from "next/server";
import { withApiMiddleware, evaluateAlerts } from "@googenie/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async () =>
  NextResponse.json({ alerts: evaluateAlerts() }),
  { auth: true, rateLimit: false }
);
