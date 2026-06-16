import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { sendDraft } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature } from "../../../../_lib/scope";
import { paramString } from "../../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiMiddleware(async (req, { auth, params }) => {
  const gate = await checkFeature(req, "email_read");
  if (gate) return gate;
  const draftId = paramString(params.draftId);
  const result = await sendDraft(getCorsairTenant(auth!.userId), draftId);
  return NextResponse.json({ message_id: result.id, thread_id: result.threadId });
});
