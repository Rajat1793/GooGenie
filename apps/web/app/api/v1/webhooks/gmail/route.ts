import { NextResponse } from "next/server";
import { processWebhookRaw } from "@googenie/server/integrations/webhooks";
import { withApiMiddleware } from "@googenie/server";
import { headersToObject, notifyEmailChanged, queryToObject, resolveTenant } from "../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiMiddleware(
  async (req) => {
    const tenantId = resolveTenant(req);
    const body = await req.json().catch(() => ({}));
    const result = await processWebhookRaw({
      headers: headersToObject(req.headers),
      body,
      query: queryToObject(req),
      tenantId,
    });
    if (result.handled) notifyEmailChanged(tenantId);
    if (result.duplicate) {
      return NextResponse.json({ status: "duplicate", plugin: result.plugin, action: result.action });
    }
    return NextResponse.json({ status: result.handled ? "processed" : "ignored", plugin: result.plugin, action: result.action });
  },
  { auth: false, rateLimit: false, idempotent: false }
);
