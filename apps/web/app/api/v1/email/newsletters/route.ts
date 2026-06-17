/**
 * GET /api/v1/email/newsletters
 *
 * Feature C2 — Smart unsubscribe sweep.
 *
 * Scans Corsair's local message cache for messages with a List-Unsubscribe
 * header, groups by sender, and returns the senders ranked by unread-rate.
 * No Gmail API calls.
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { fetchNewsletterSenders } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth }) => {
  const gate = await checkFeature(req, "email_read");
  if (gate) return gate;
  const tenant = getCorsairTenant(auth!.userId);
  const url = new URL(req.url);
  const limit = Math.max(5, Math.min(100, Number(url.searchParams.get("limit") ?? 30)));
  const senders = await fetchNewsletterSenders(tenant, limit);
  return NextResponse.json({ senders });
});
