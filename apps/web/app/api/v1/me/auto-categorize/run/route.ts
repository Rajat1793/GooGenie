/**
 * POST /api/v1/me/auto-categorize/run  — body: { limit?: number }
 *
 * Scans the most recent N unread INBOX messages, classifies each with
 * Mistral (or a regex fallback), and applies a "Googenie/<category>" Gmail
 * label via Corsair. Returns counts per category + a few examples.
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
  updateUserSetting,
} from "@googenie/db/users";
import { checkFeature } from "../../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runSchema = z.object({ limit: z.number().int().min(1).max(50).optional() });

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "email_read");
  if (gate) return gate;
  const parsed = await validateBody(runSchema, req, { traceId, message: "Invalid run payload" });
  if (!parsed.ok) return parsed.response;
  const tenant = getCorsairTenant(auth!.userId);
  const result = await runAutoCategorize(tenant, parsed.data.limit ?? 10);
  const me = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  if (me) {
    await updateUserSetting(me.id, "autoCategorizeLastRun", new Date().toISOString());
  }
  return NextResponse.json(result);
});
