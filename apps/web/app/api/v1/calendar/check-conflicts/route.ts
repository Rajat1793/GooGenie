/**
 * POST /api/v1/calendar/check-conflicts
 *
 * Feature C3 — AI calendar conflict resolver.
 *
 * Body: { starts_at, ends_at, title, attendees? }
 * Returns: { hasConflicts, conflicts, suggestedToMove, newEventYields, summary, draftReply }
 *
 * Used by CreateEventModal: when the user picks a time, we POST here to detect
 * conflicts and surface AI-powered resolution suggestions before they hit Save.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { resolveCalendarConflicts } from "@googenie/server/integrations/conflict-resolver";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  starts_at: z.string(),
  ends_at: z.string(),
  title: z.string().min(1).max(200),
  attendees: z.array(z.string()).optional(),
});

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "calendar_read");
  if (gate) return gate;

  const parsed = await validateBody(bodySchema, req, { traceId, message: "Invalid payload" });
  if (!parsed.ok) return parsed.response;

  const { starts_at, ends_at, title, attendees = [] } = parsed.data;

  // Validate dates.
  const startMs = new Date(starts_at).getTime();
  const endMs = new Date(ends_at).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return NextResponse.json({ error: "Invalid time range" }, { status: 400 });
  }

  const tenant = getCorsairTenant(auth!.userId);
  const result = await resolveCalendarConflicts({
    tenantId: tenant,
    userId: auth!.userId,
    startsAt: starts_at,
    endsAt: ends_at,
    title,
    attendees,
  });

  return NextResponse.json(result);
});
