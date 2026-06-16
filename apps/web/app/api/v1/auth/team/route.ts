import { NextResponse } from "next/server";
import { withApiMiddleware, createApiError, statusFromApiError } from "@googenie/server";
import { getUserByClerkId, listDirectReports } from "@googenie/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (_req, { auth, traceId }) => {
  const { userId, role } = auth!;
  if (!["super_admin", "manager_admin"].includes(role)) {
    return NextResponse.json(
      createApiError("FORBIDDEN", "Only managers can view team", false, traceId),
      { status: statusFromApiError("FORBIDDEN") }
    );
  }
  let dbUserId = userId;
  if (userId.startsWith("user_")) {
    const dbUser = await getUserByClerkId(userId);
    if (dbUser) dbUserId = dbUser.id;
  }
  const reports = await listDirectReports(dbUserId);
  return NextResponse.json({ team: reports });
});
