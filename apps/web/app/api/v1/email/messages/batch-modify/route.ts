import { NextResponse } from "next/server";
import { withApiMiddleware, createApiError, statusFromApiError } from "@googenie/server";
import { batchModifyMessages } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature } from "../../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "email_read");
  if (gate) return gate;
  const body = (await req.json().catch(() => ({}))) as {
    ids?: string[];
    add_label_ids?: string[];
    remove_label_ids?: string[];
  };
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "ids array required", false, traceId), {
      status: statusFromApiError("VALIDATION_ERROR"),
    });
  }
  await batchModifyMessages(
    getCorsairTenant(auth!.userId),
    body.ids,
    body.add_label_ids ?? [],
    body.remove_label_ids ?? []
  );
  return NextResponse.json({ success: true });
});
