import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { fetchGmailThread } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature, getScopedUserIds, notFound } from "../../../_lib/scope";
import { paramString } from "../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth, traceId, params }) => {
  const gate = await checkFeature(req, "email_read");
  if (gate) return gate;
  const threadId = paramString(params.threadId);
  const scopedIds = getScopedUserIds(auth!);
  const thread = await fetchGmailThread(getCorsairTenant(auth!.userId), threadId, auth!.userId, scopedIds);
  if (!thread) return notFound("Thread not found in tenant scope", traceId);
  return NextResponse.json({ thread });
});
