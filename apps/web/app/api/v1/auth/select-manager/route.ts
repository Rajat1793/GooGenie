import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware, createApiError, statusFromApiError } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { getUserByClerkId, getUserById, setUserManager } from "@googenie/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const userId = auth!.userId;
  const parsed = await validateBody(z.object({ managerId: z.string().min(1) }), req, { traceId, message: "managerId required" });
  if (!parsed.ok) return parsed.response;

  const dbUser = (await getUserByClerkId(userId)) ?? (await getUserById(userId));
  if (!dbUser) {
    return NextResponse.json(createApiError("NOT_FOUND", "User not found", false, traceId), { status: statusFromApiError("NOT_FOUND") });
  }
  await setUserManager(dbUser.id, parsed.data.managerId);
  return NextResponse.json({ success: true });
});
