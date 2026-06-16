/**
 * DELETE /api/v1/email/messages/scheduled/:id   — cancel a queued send.
 * Returns 200 if cancelled, 404 if already sent / not yours / unknown id.
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { cancelScheduledEmail } from "@googenie/db/scheduledEmails";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { paramString } from "../../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withApiMiddleware(async (_req, { auth, params }) => {
  const idStr = paramString(params.id);
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const me = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  if (!me) {
    return NextResponse.json({ error: "Not cancellable" }, { status: 404 });
  }
  const ok = await cancelScheduledEmail(id, me.id);
  if (!ok) {
    return NextResponse.json({ error: "Not cancellable (already sent or unknown)" }, { status: 404 });
  }
  return NextResponse.json({ cancelled: true });
});
