/**
 * GET  /api/v1/me/snippets — list this user's text-template snippets
 * POST /api/v1/me/snippets — create a snippet
 *
 * Snippets expand inline in compose via `;hotkey<Tab|Space>`.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import {
  listUserSnippets,
  createSnippet,
} from "@googenie/db/snippets";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth }) => {
  const gate = await checkFeature(req, "snippets");
  if (gate) return gate;

  const u = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  if (!u) return NextResponse.json({ snippets: [] });

  const rows = await listUserSnippets(u.id);
  return NextResponse.json({ snippets: rows });
});

const HOTKEY_RE = /^[a-z0-9_-]{1,32}$/i;

const createSchema = z.object({
  name: z.string().min(1).max(120),
  body: z.string().min(1).max(10_000),
  hotkey: z.string().regex(HOTKEY_RE, "hotkey must be 1–32 chars: letters, digits, _ or -"),
});

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "snippets");
  if (gate) return gate;

  const parsed = await validateBody(createSchema, req, {
    traceId,
    message: "Invalid snippet payload",
  });
  if (!parsed.ok) return parsed.response;

  const u = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  if (!u) {
    return NextResponse.json({ error: "User not provisioned" }, { status: 400 });
  }

  try {
    const row = await createSnippet({
      userId: u.id,
      tenantId: u.tenantId,
      name: parsed.data.name,
      body: parsed.data.body,
      hotkey: parsed.data.hotkey,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return NextResponse.json(
        { error: `A snippet with hotkey "${parsed.data.hotkey}" already exists.` },
        { status: 409 },
      );
    }
    throw err;
  }
});
