/**
 * GET /api/v1/auth/config — public Clerk config exposure.
 * Mirrors backend/src/routes/system.ts.
 */
import { NextResponse } from "next/server";
import { withApiMiddleware, env } from "@googenie/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(
  async () =>
    NextResponse.json({
      clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? env.CLERK_PUBLISHABLE_KEY ?? null,
    }),
  { auth: false, rateLimit: false }
);
