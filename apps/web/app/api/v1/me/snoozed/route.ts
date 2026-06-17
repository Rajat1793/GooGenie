/**
 * GET /api/v1/me/snoozed — list this user's currently-snoozed threads.
 *
 * The inbox endpoint already filters snoozed thread IDs; this route is for
 * surfacing a "Snoozed" view in the UI.
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { listUserSnoozedThreads } from "@googenie/db/snoozedThreads";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth }) => {
  const gate = await checkFeature(req, "snooze_threads");
  if (gate) return gate;

  const u = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  if (!u) return NextResponse.json({ snoozed: [] });

  const rows = await listUserSnoozedThreads(u.id);
  return NextResponse.json({ snoozed: rows });
});
