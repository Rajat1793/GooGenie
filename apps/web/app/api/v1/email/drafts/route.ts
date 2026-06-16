import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { sendEmailSchema } from "@googenie/server/contracts/schemas";
import { listDrafts, createDraft } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth }) => {
  const gate = await checkFeature(req, "email_read");
  if (gate) return gate;
  const drafts = await listDrafts(getCorsairTenant(auth!.userId));
  return NextResponse.json({ drafts });
});

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "email_read");
  if (gate) return gate;
  const parsed = await validateBody(sendEmailSchema, req, { traceId, message: "Invalid draft payload" });
  if (!parsed.ok) return parsed.response;
  const draft = await createDraft(getCorsairTenant(auth!.userId), parsed.data);
  return NextResponse.json({ draft_id: draft.id }, { status: 201 });
});
