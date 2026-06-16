/**
 * GET /api/v1/auth/me — return the DB user profile for the caller.
 */
import { NextResponse } from "next/server";
import { withApiMiddleware, createApiError, statusFromApiError } from "@googenie/server";
import { getUserByClerkId, getUserById } from "@googenie/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (_req, { auth, traceId }) => {
  const userId = auth!.userId;
  const user = (await getUserByClerkId(userId)) ?? (await getUserById(userId));
  if (!user) {
    return NextResponse.json(
      createApiError("NOT_FOUND", "User not found", false, traceId),
      { status: statusFromApiError("NOT_FOUND") }
    );
  }
  return NextResponse.json({ user });
});
