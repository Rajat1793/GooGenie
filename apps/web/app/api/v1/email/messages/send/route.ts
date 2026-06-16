import { NextResponse } from "next/server";
import { withApiMiddleware, publish } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { sendEmailSchema } from "@googenie/server/contracts/schemas";
import { sendEmail } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature } from "../../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "email_write");
  if (gate) return gate;
  const parsed = await validateBody(sendEmailSchema, req, { traceId, message: "Invalid send payload" });
  if (!parsed.ok) return parsed.response;
  const result = await sendEmail(getCorsairTenant(auth!.userId), parsed.data);
  publish({ kind: "email.changed", userId: auth!.userId, threadId: result.threadId });
  return NextResponse.json({ message_id: result.id, thread_id: result.threadId }, { status: 201 });
});
