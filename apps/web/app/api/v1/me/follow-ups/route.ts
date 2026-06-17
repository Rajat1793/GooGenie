/**
 * GET /api/v1/me/follow-ups
 *
 * Feature B4 — Follow-up auto-tracker.
 *
 * Returns sent emails that haven't received a reply yet, past their follow_up_at date.
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { checkFollowUps } from "@googenie/server/integrations/follow-up-tracker";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth }) => {
  const gate = await checkFeature(req, "ai_follow_up_tracker");
  if (gate) return gate;

  const me = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  const tenant = getCorsairTenant(auth!.userId);
  const pending = await checkFollowUps(tenant, auth!.userId, me?.email ?? null);

  return NextResponse.json({ follow_ups: pending });
});
