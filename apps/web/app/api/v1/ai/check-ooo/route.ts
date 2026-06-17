/**
 * POST /api/v1/ai/check-ooo
 *
 * Feature A5 — Out-of-office detection.
 *
 * Body: { email: string }
 *
 * Scans recent messages from that sender via Corsair's local cache for
 * auto-reply headers (Auto-Submitted, Precedence) or OOO keywords. Returns
 * { isOOO, returnDate, snippet }.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { checkSenderOOO } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ email: z.string().email() });

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "email_read");
  if (gate) return gate;
  const parsed = await validateBody(bodySchema, req, { traceId, message: "Invalid payload" });
  if (!parsed.ok) return parsed.response;

  const tenant = getCorsairTenant(auth!.userId);
  const ooo = await checkSenderOOO(tenant, parsed.data.email, 5);

  return NextResponse.json(ooo);
});
