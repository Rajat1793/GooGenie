import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { listGmailLabels } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth }) => {
  const gate = await checkFeature(req, "email_read");
  if (gate) return gate;
  const labels = await listGmailLabels(getCorsairTenant(auth!.userId));
  return NextResponse.json({ labels });
});
