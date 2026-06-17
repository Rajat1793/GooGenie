/**
 * GET   /api/v1/me/auto-categorize         — read current toggle + last run hint
 * POST  /api/v1/me/auto-categorize/toggle  — flip on/off
 * POST  /api/v1/me/auto-categorize/run     — manually scan recent unread inbox
 *
 * Feature A4 — Auto-categorize on arrival.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { runAutoCategorize } from "@googenie/server/integrations/auto-categorize";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import {
  getUserById,
  getUserByClerkId,
  getUserSettings,
  updateUserSetting,
} from "@googenie/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveInternalUserId(authUserId: string): Promise<string | null> {
  const me = (await getUserById(authUserId)) ?? (await getUserByClerkId(authUserId));
  return me?.id ?? null;
}

export const GET = withApiMiddleware(async (_req, { auth }) => {
  const id = await resolveInternalUserId(auth!.userId);
  if (!id) return NextResponse.json({ enabled: false });
  const settings = await getUserSettings(id);
  return NextResponse.json({
    enabled: Boolean(settings.autoCategorize),
    last_run: settings.autoCategorizeLastRun ?? null,
  });
});
