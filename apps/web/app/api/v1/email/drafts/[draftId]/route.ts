import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { deleteDraft, sendDraft } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature } from "../../../_lib/scope";
import { paramString } from "../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withApiMiddleware(async (req, { auth, params }) => {
  const gate = await checkFeature(req, "email_read");
  if (gate) return gate;
  const draftId = paramString(params.draftId);
  await deleteDraft(getCorsairTenant(auth!.userId), draftId);
  return new NextResponse(null, { status: 204 });
});
