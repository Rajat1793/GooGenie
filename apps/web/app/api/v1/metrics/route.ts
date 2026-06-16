import { NextResponse } from "next/server";
import { withApiMiddleware, getCounters, getLatency } from "@googenie/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async () =>
  NextResponse.json({ counters: getCounters(), latency: getLatency() }),
  { auth: true, rateLimit: false }
);
