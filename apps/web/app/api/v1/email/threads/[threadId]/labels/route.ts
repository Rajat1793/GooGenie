import { NextResponse } from "next/server";
import { withApiMiddleware, publish } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { modifyLabelsSchema } from "@googenie/server/contracts/schemas";
import { modifyThreadLabels } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature } from "../../../../_lib/scope";
import { paramString } from "../../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withApiMiddleware(async (req, { auth, traceId, params }) => {
  const gate = await checkFeature(req, "email_read");
  if (gate) return gate;
  const threadId = paramString(params.threadId);
  const parsed = await validateBody(modifyLabelsSchema, req, { traceId, message: "Invalid labels payload" });
  if (!parsed.ok) return parsed.response;
  const result = await modifyThreadLabels(
    getCorsairTenant(auth!.userId),
    threadId,
    parsed.data.add_label_ids,
    parsed.data.remove_label_ids
  );
  publish({ kind: "email.changed", userId: auth!.userId, threadId });
  return NextResponse.json({ thread_id: result.id ?? threadId });
});
