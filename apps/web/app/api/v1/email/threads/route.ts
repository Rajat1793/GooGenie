import { NextResponse } from "next/server";
import { withApiMiddleware, paginate } from "@googenie/server";
import { fetchGmailThreads } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { listActiveSnoozedIds } from "@googenie/db/snoozedThreads";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
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
  let threads = await fetchGmailThreads(getCorsairTenant(auth!.userId), requestedUserId, 100, q);

  // Filter out still-snoozed threads (basic feature: snooze_threads). Awaken
  // anything past wake_at lazily so the user sees it again on this fetch.
  // The "snoozed" view (?include=snoozed) shows only currently-snoozed rows.
  const showSnoozed = url.searchParams.get("include") === "snoozed";
  try {
    const me = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
    if (me) {
      const { active } = await listActiveSnoozedIds(me.id);
      const activeSet = new Set(active);
      threads = showSnoozed
        ? threads.filter((t) => activeSet.has(t.id))
        : threads.filter((t) => !activeSet.has(t.id));
    }
  } catch {
    // DB may not have the snoozed_threads table on first boot — fall through.
  }

  const page = paginate(
    threads,
    url.searchParams.get("cursor") ?? undefined,
    url.searchParams.get("limit") ?? undefined
  );
  return NextResponse.json({ threads: page.items, total: page.total, next_cursor: page.next_cursor });
});
