/**
 * GET  /api/v1/me/tasks       — list open tasks
 * POST /api/v1/me/tasks/extract — sweep recent emails & extract action items
 *
 * Feature C1 — Email-to-task extractor.
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { listOpenTasks } from "@googenie/db/tasks";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveInternalUserId(authUserId: string): Promise<string | null> {
  const u = (await getUserById(authUserId)) ?? (await getUserByClerkId(authUserId));
  return u?.id ?? null;
}

export const GET = withApiMiddleware(async (req, { auth }) => {
  const gate = await checkFeature(req, "ai_task_extractor");
  if (gate) return gate;

  const internalId = await resolveInternalUserId(auth!.userId);
  if (!internalId) return NextResponse.json({ tasks: [] });

  const tasks = await listOpenTasks(internalId, 50);
  return NextResponse.json({ tasks });
});
