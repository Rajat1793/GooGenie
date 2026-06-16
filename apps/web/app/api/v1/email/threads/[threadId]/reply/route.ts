import { NextResponse } from "next/server";
import { withApiMiddleware, publish } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { replyEmailSchema } from "@googenie/server/contracts/schemas";
import { replyToThread } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature } from "../../../../_lib/scope";
import { paramString } from "../../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiMiddleware(async (req, { auth, traceId, params }) => {
  const gate = await checkFeature(req, "email_write");
  if (gate) return gate;
  const threadId = paramString(params.threadId);
  const parsed = await validateBody(replyEmailSchema, req, { traceId, message: "Invalid reply payload" });
  if (!parsed.ok) return parsed.response;
  const result = await replyToThread(getCorsairTenant(auth!.userId), {
    threadId,
    ...parsed.data,
    messageId: parsed.data.message_id,
  });
  publish({ kind: "email.changed", userId: auth!.userId, threadId: result.threadId ?? threadId });
  return NextResponse.json({ message_id: result.id, thread_id: result.threadId }, { status: 201 });
});
