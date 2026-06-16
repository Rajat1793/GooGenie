/**
 * GET /api/v1/booking/:slug
 *
 * Public — no auth. Returns the booking link's display metadata so the
 * /book/<slug> page can render a header (no PII leakage about which user
 * owns it beyond the title they chose).
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { getBookingLinkBySlug } from "@googenie/db/bookingLinks";
import { paramString } from "../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(
  async (_req, { params }) => {
    const slug = paramString(params.slug);
    const link = await getBookingLinkBySlug(slug);
    if (!link || !link.isActive) {
      return NextResponse.json({ error: "Booking link not found" }, { status: 404 });
    }
    return NextResponse.json({
      slug: link.slug,
      title: link.title,
      duration_minutes: link.durationMinutes,
      days_ahead: link.daysAhead,
      business_hours: link.businessHours,
    });
  },
  { auth: false, rateLimit: true },
);
