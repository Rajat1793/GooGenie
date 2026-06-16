/**
 * GET    /api/v1/email/messages/scheduled       — list the user's queued emails
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { listUserScheduledEmails } from "@googenie/db/scheduledEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (_req, { auth }) => {
  const rows = await listUserScheduledEmails(auth!.userId, ["queued"]);
  return NextResponse.json({ scheduled: rows });
});
