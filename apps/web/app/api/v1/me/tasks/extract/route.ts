/**
 * POST /api/v1/me/tasks/extract
 *
 * Feature C1 — Email-to-task extractor (manual sweep).
 * Scans recent unread inbox messages and extracts action items via Mistral.
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { runTaskExtraction } from "@googenie/server/integrations/task-extractor";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { checkFeature } from "../../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiMiddleware(async (req, { auth }) => {
  const gate = await checkFeature(req, "ai_summary");
  if (gate) return gate;

  const u = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  if (!u) return NextResponse.json({ scanned: 0, created: 0, skipped: 0, tasks: [] });

  const tenant = getCorsairTenant(auth!.userId);
  const result = await runTaskExtraction({
    tenantId: tenant,
    userId: u.id,
    limit: 15,
  });
  return NextResponse.json(result);
});
