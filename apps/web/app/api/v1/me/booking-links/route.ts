/**
 * GET  /api/v1/me/booking-links  — list the user's booking links
 * POST /api/v1/me/booking-links  — create a new link
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { listUserBookingLinks, createBookingLink } from "@googenie/db/bookingLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (_req, { auth }) => {
  const links = await listUserBookingLinks(auth!.userId);
  return NextResponse.json({ links });
});

const createSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  duration_minutes: z.number().int().min(15).max(480).optional(),
  days_ahead: z.number().int().min(1).max(60).optional(),
  business_hours: z
    .object({ start: z.number().int().min(0).max(23), end: z.number().int().min(1).max(24) })
    .refine((v) => v.end > v.start, "business_hours.end must be > start")
    .optional(),
});

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const parsed = await validateBody(createSchema, req, {
    traceId,
    message: "Invalid booking-link payload",
  });
  if (!parsed.ok) return parsed.response;
  const link = await createBookingLink({
    userId: auth!.userId,
    title: parsed.data.title,
    durationMinutes: parsed.data.duration_minutes,
    daysAhead: parsed.data.days_ahead,
    businessHours: parsed.data.business_hours,
  });
  return NextResponse.json(link, { status: 201 });
});
