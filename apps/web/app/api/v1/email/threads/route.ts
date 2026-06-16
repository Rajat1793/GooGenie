import { NextResponse } from "next/server";
import { withApiMiddleware, paginate } from "@googenie/server";
import { fetchGmailThreads } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { forbidden, getScopedUserIds, checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "email_read");
  if (gate) return gate;

  const url = new URL(req.url);
  const requestedUserId = url.searchParams.get("userId") ?? auth!.userId;
  if (!getScopedUserIds(auth!).has(requestedUserId)) {
    return forbidden("Requested user is out of scope", traceId);
  }
  const q = url.searchParams.get("q") ?? undefined;
  const threads = await fetchGmailThreads(getCorsairTenant(auth!.userId), requestedUserId, 10, q);
  const page = paginate(
    threads,
    url.searchParams.get("cursor") ?? undefined,
    url.searchParams.get("limit") ?? undefined
  );
  return NextResponse.json({ threads: page.items, total: page.total, next_cursor: page.next_cursor });
});
