/**
 * PATCH  /api/v1/me/tasks/[taskId]   — update status
 * DELETE /api/v1/me/tasks/[taskId]   — remove task
 *
 * Feature C1 — task lifecycle management.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { updateTaskStatus, deleteTaskById } from "@googenie/db/tasks";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { paramString } from "../../../_lib/params";
import { checkFeature } from "../../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["open", "done", "dismissed"]),
});

async function resolveInternalUserId(authUserId: string): Promise<string | null> {
  const u = (await getUserById(authUserId)) ?? (await getUserByClerkId(authUserId));
  return u?.id ?? null;
}

export const PATCH = withApiMiddleware(async (req, { auth, params, traceId }) => {
  const gate = await checkFeature(req, "ai_task_extractor");
  if (gate) return gate;

  const taskIdStr = paramString(params.taskId);
  const taskId = taskIdStr ? Number(taskIdStr) : NaN;
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });
  }

  const parsed = await validateBody(patchSchema, req, { traceId, message: "Invalid payload" });
  if (!parsed.ok) return parsed.response;

  const internalId = await resolveInternalUserId(auth!.userId);
  if (!internalId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const updated = await updateTaskStatus(internalId, taskId, parsed.data.status);
  if (!updated) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ task: updated });
});

export const DELETE = withApiMiddleware(async (req, { auth, params }) => {
  const gate = await checkFeature(req, "ai_task_extractor");
  if (gate) return gate;

  const taskIdStr = paramString(params.taskId);
  const taskId = taskIdStr ? Number(taskIdStr) : NaN;
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: "Invalid taskId" }, { status: 400 });
  }

  const internalId = await resolveInternalUserId(auth!.userId);
  if (!internalId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const ok = await deleteTaskById(internalId, taskId);
  if (!ok) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
});
