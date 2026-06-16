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
  const rows = await listUserScheduledEmails(me.id, ["queued"]);
  return NextResponse.json({ scheduled: rows });
});
