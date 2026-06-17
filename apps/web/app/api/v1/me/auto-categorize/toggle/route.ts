/**
 * POST /api/v1/me/auto-categorize/toggle  — body: { enabled: boolean }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import {
  getUserById,
  getUserByClerkId,
  updateUserSetting,
} from "@googenie/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toggleSchema = z.object({ enabled: z.boolean() });

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const parsed = await validateBody(toggleSchema, req, { traceId, message: "Invalid toggle payload" });
  if (!parsed.ok) return parsed.response;
  const me = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  if (!me) return NextResponse.json({ error: "User not provisioned" }, { status: 400 });
  await updateUserSetting(me.id, "autoCategorize", parsed.data.enabled);
  return NextResponse.json({ enabled: parsed.data.enabled });
});
