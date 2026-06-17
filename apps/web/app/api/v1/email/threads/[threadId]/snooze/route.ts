/**
 * POST   /api/v1/email/threads/:threadId/snooze   { wake_at: ISO8601 }
 * DELETE /api/v1/email/threads/:threadId/snooze   — unsnooze
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { snoozeThread, unsnoozeThread } from "@googenie/db/snoozedThreads";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { checkFeature } from "../../../../_lib/scope";
import { paramString } from "../../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const snoozeSchema = z.object({
  /** ISO-8601 timestamp at which the thread becomes visible again. */
  wake_at: z.string().datetime(),
});

export const POST = withApiMiddleware(async (req, { auth, traceId, params }) => {
  const gate = await checkFeature(req, "snooze_threads");
  if (gate) return gate;

  const parsed = await validateBody(snoozeSchema, req, {
    traceId,
    message: "Invalid snooze payload",
  });
  if (!parsed.ok) return parsed.response;

  const wakeAt = new Date(parsed.data.wake_at);
  if (wakeAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "wake_at must be in the future" },
      { status: 400 },
    );
  }

  const u = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  if (!u) {
    return NextResponse.json({ error: "User not provisioned" }, { status: 400 });
  }

  const threadId = paramString(params.threadId);
  const row = await snoozeThread({
    userId: u.id,
    tenantId: u.tenantId,
    threadId,
    wakeAt,
  });
  return NextResponse.json(row, { status: 201 });
});

export const DELETE = withApiMiddleware(async (req, { auth, params }) => {
  const gate = await checkFeature(req, "snooze_threads");
  if (gate) return gate;

  const u = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  if (!u) return NextResponse.json({ deleted: false }, { status: 404 });

  const threadId = paramString(params.threadId);
  const ok = await unsnoozeThread(u.id, threadId);
  return NextResponse.json({ deleted: ok });
});
