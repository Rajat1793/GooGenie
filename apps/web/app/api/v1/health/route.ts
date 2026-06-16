/**
 * GET /api/v1/health — public health check (Phase 6 step 28).
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(
  async () => NextResponse.json({ ok: true, ts: new Date().toISOString() }),
  { auth: false, rateLimit: false }
);
