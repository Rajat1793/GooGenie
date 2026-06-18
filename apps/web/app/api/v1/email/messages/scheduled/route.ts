/**
 * GET    /api/v1/email/messages/scheduled       — list the user's queued emails
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { listUserScheduledEmails } from "@googenie/db/scheduledEmails";
import { getUserById, getUserByClerkId } from "@googenie/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (_req, { auth }) => {
  const me = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  if (!me) return NextResponse.json({ scheduled: [] });
  // Include `sending` (the poller has it, mid-flight) and `failed` (so the
  // user actually sees why a queued send didn't go out instead of having
  // the row silently disappear). The panel shows these inline.
  const rows = await listUserScheduledEmails(me.id, ["queued", "sending", "failed"]);
  return NextResponse.json({ scheduled: rows });
});
