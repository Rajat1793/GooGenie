/**
 * PATCH  /api/v1/me/snippets/:id  — update a snippet
 * DELETE /api/v1/me/snippets/:id  — delete a snippet
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { updateSnippet, deleteSnippet } from "@googenie/db/snippets";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { checkFeature } from "../../../_lib/scope";
import { paramString } from "../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOTKEY_RE = /^[a-z0-9_-]{1,32}$/i;

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(10_000).optional(),
  hotkey: z.string().regex(HOTKEY_RE).optional(),
});

async function resolveInternalUserId(authUserId: string): Promise<string | null> {
  const u = (await getUserById(authUserId)) ?? (await getUserByClerkId(authUserId));
  return u?.id ?? null;
}

export const PATCH = withApiMiddleware(async (req, { auth, traceId, params }) => {
  const gate = await checkFeature(req, "snippets");
  if (gate) return gate;

  const id = Number(paramString(params.id));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const parsed = await validateBody(patchSchema, req, {
    traceId,
    message: "Invalid snippet patch",
  });
  if (!parsed.ok) return parsed.response;

  const internalId = await resolveInternalUserId(auth!.userId);
  if (!internalId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const row = await updateSnippet(id, internalId, parsed.data);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return NextResponse.json(
        { error: `A snippet with that hotkey already exists.` },
        { status: 409 },
      );
    }
    throw err;
  }
});

export const DELETE = withApiMiddleware(async (req, { auth, params }) => {
  const gate = await checkFeature(req, "snippets");
  if (gate) return gate;

  const id = Number(paramString(params.id));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const internalId = await resolveInternalUserId(auth!.userId);
  if (!internalId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ok = await deleteSnippet(id, internalId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
});
