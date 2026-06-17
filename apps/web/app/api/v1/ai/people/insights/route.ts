/**
 * GET /api/v1/ai/people/insights?email=foo@bar.com
 *
 * Feature A1 — Sender Intelligence Dashboard.
 *
 * Returns stats for a given email address:
 *   - Total threads, last contact
 *   - Awaiting-my-reply count
 *   - Avg response times (you vs them)
 *   - Recent threads with direction
 *   - (Future) Topic clusters via embeddings
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { fetchSenderStats } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { checkFeature } from "../../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth }) => {
  const gate = await checkFeature(req, "ai_sender_insights");
  if (gate) return gate;

  const url = new URL(req.url);
  const email = url.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "Missing email parameter" }, { status: 400 });
  }

  const me = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  const tenant = getCorsairTenant(auth!.userId);
  const stats = await fetchSenderStats(tenant, email, me?.email ?? null, 20);

  if (!stats) {
    return NextResponse.json({ error: "No data found for this sender" }, { status: 404 });
  }

  return NextResponse.json({ stats });
});
