/**
 * PATCH  /api/v1/me/booking-links/:id  — update title/duration/active flag
 * DELETE /api/v1/me/booking-links/:id
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { updateBookingLink, deleteBookingLink } from "@googenie/db/bookingLinks";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { paramString } from "../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveInternalUserId(authUserId: string): Promise<string | null> {
  const me = (await getUserById(authUserId)) ?? (await getUserByClerkId(authUserId));
  return me?.id ?? null;
}

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  duration_minutes: z.number().int().min(15).max(480).optional(),
  days_ahead: z.number().int().min(1).max(60).optional(),
  business_hours: z
    .object({ start: z.number().int().min(0).max(23), end: z.number().int().min(1).max(24) })
    .refine((v) => v.end > v.start, "business_hours.end must be > start")
    .optional(),
  is_active: z.boolean().optional(),
});

export const PATCH = withApiMiddleware(async (req, { auth, traceId, params }) => {
  const id = Number(paramString(params.id));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const parsed = await validateBody(patchSchema, req, {
    traceId,
    message: "Invalid booking-link patch",
  });
  if (!parsed.ok) return parsed.response;
  const internalId = await resolveInternalUserId(auth!.userId);
  if (!internalId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const link = await updateBookingLink(id, internalId, {
    title: parsed.data.title,
    durationMinutes: parsed.data.duration_minutes,
    daysAhead: parsed.data.days_ahead,
    businessHours: parsed.data.business_hours,
    isActive: parsed.data.is_active,
  });
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(link);
});

export const DELETE = withApiMiddleware(async (_req, { auth, params }) => {
  const id = Number(paramString(params.id));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const internalId = await resolveInternalUserId(auth!.userId);
  if (!internalId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ok = await deleteBookingLink(id, internalId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
});
