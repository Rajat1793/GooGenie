import { NextResponse } from "next/server";
import { withApiMiddleware, publish } from "@googenie/server";
import { cache } from "@googenie/server/security/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiMiddleware(async (req, { auth }) => {
  const userId = auth!.userId;
  const body = await req.json().catch(() => ({}));
  const kind = (body as Record<string, unknown>)?.kind;

  if (kind === "email") {
    const threadId = (body as Record<string, unknown>)?.threadId;
    publish({ kind: "email.received", userId, ...(threadId ? { threadId: String(threadId) } : {}) });
    cache.invalidatePrefix(`threads:u_${userId}`);
    return NextResponse.json({ ok: true, fired: "email.received", userId });
  }
  if (kind === "calendar") {
    const eventId = (body as Record<string, unknown>)?.eventId;
    publish({ kind: "calendar.received", userId, ...(eventId ? { eventId: String(eventId) } : {}) });
    cache.invalidatePrefix(`events:u_${userId}`);
    return NextResponse.json({ ok: true, fired: "calendar.received", userId });
  }
  return NextResponse.json({ error: "kind must be 'email' or 'calendar'" }, { status: 400 });
});
