/**
 * GET /api/v1/email/reply-needed
 *
 * Feature A2 — "Threads waiting on me" inbox view.
 *
 * Uses Corsair's local message cache to find threads where the LAST message
 * is from someone else and you haven't replied yet. Ranked by urgency
 * keywords + how long the thread has been waiting.
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { fetchReplyNeededThreads } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth }) => {
  const gate = await checkFeature(req, "email_read");
  if (gate) return gate;
  const me = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  const tenant = getCorsairTenant(auth!.userId);
  const url = new URL(req.url);
  const limit = Math.max(5, Math.min(100, Number(url.searchParams.get("limit") ?? 50)));
  const rows = await fetchReplyNeededThreads(tenant, auth!.userId, me?.email ?? null, limit);
  return NextResponse.json({ threads: rows });
});
