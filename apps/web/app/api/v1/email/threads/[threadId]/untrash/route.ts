import { NextResponse } from "next/server";
import { withApiMiddleware, publish } from "@googenie/server";
import { untrashThread } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature } from "../../../../_lib/scope";
import { paramString } from "../../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiMiddleware(async (req, { auth, params }) => {
  const gate = await checkFeature(req, "email_read");
  if (gate) return gate;
  const threadId = paramString(params.threadId);
  await untrashThread(getCorsairTenant(auth!.userId), threadId);
  publish({ kind: "email.changed", userId: auth!.userId, threadId });
  return NextResponse.json({ success: true });
});
