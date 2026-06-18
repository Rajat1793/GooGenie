import { NextResponse } from "next/server";
import { withApiMiddleware, paginate } from "@googenie/server";
import { fetchSentThreads } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/email/sent — list of threads in the user's SENT label,
 * paginated and searchable just like /email/threads.
 *
 * Gated by `email_read` because reading sent mail is fundamentally an email
 * read operation; we don't need a separate `email_sent` toggle.
 */
export const GET = withApiMiddleware(async (req, { auth }) => {
  const gate = await checkFeature(req, "email_read");
  if (gate) return gate;

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const threads = await fetchSentThreads(
    getCorsairTenant(auth!.userId),
    auth!.userId,
    100,
    q,
  );

  const page = paginate(
    threads,
    url.searchParams.get("cursor") ?? undefined,
    url.searchParams.get("limit") ?? undefined,
  );
  return NextResponse.json({
    threads: page.items,
    total: page.total,
    next_cursor: page.next_cursor,
  });
});
