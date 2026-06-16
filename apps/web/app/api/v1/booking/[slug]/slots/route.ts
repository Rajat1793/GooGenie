/**
 * GET /api/v1/booking/:slug/slots
 *
 * Public — no auth. Returns the list of available 30/45/60-min slots for
 * the owning user over the next N business days. Walks business-hour slots
 * at 30-min granularity and rejects anything overlapping a busy block from
 * Google Calendar freebusy.
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { checkAvailability } from "@googenie/server/integrations/googlecalendar";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { getBookingLinkBySlug } from "@googenie/db/bookingLinks";
import { getUserById } from "@googenie/db/users";
import { paramString } from "../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLOT_GRANULARITY_MIN = 30;
const MAX_SLOTS = 80;

interface BusyBlock {
  start: number;
  end: number;
}

function* iterateCandidates(
  start: Date,
  end: Date,
  durationMin: number,
  businessHours: { start: number; end: number },
): Generator<{ start: Date; end: Date }> {
  const durationMs = durationMin * 60 * 1000;
  const cursor = new Date(start);
  cursor.setSeconds(0, 0);
  const minute = cursor.getMinutes();
  cursor.setMinutes(minute + ((SLOT_GRANULARITY_MIN - (minute % SLOT_GRANULARITY_MIN)) % SLOT_GRANULARITY_MIN));

  while (cursor.getTime() + durationMs <= end.getTime()) {
    const hour = cursor.getHours();
    const day = cursor.getDay();
    // Skip weekends + outside business hours.
    if (day !== 0 && day !== 6 && hour >= businessHours.start && hour < businessHours.end) {
      yield { start: new Date(cursor), end: new Date(cursor.getTime() + durationMs) };
    }
    cursor.setTime(cursor.getTime() + SLOT_GRANULARITY_MIN * 60 * 1000);
  }
}

function overlapsBusy(slot: { start: Date; end: Date }, busy: BusyBlock[]): boolean {
  const s = slot.start.getTime();
  const e = slot.end.getTime();
  return busy.some((b) => s < b.end && e > b.start);
}

export const GET = withApiMiddleware(
  async (_req, { params }) => {
    const slug = paramString(params.slug);
    const link = await getBookingLinkBySlug(slug);
    if (!link || !link.isActive) {
      return NextResponse.json({ error: "Booking link not found" }, { status: 404 });
    }

    const now = new Date();
    // Anchor the window at the start of TOMORROW so visitors don't see a
    // half-day of today's leftover slots.
    const startWindow = new Date(now);
    startWindow.setHours(0, 0, 0, 0);
    startWindow.setDate(startWindow.getDate() + 1);
    const endWindow = new Date(startWindow);
    endWindow.setDate(endWindow.getDate() + link.daysAhead);

    const tenant = getCorsairTenant(((await getUserById(link.userId))?.clerkUserId) ?? link.userId);
    const fb = await checkAvailability(tenant, {
      timeMin: startWindow.toISOString(),
      timeMax: endWindow.toISOString(),
    }).catch(() => []);
    const busy: BusyBlock[] = fb.flatMap((c) =>
      c.busy.map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() })),
    );

    const slots: Array<{ start: string; end: string }> = [];
    for (const slot of iterateCandidates(startWindow, endWindow, link.durationMinutes, link.businessHours)) {
      if (slots.length >= MAX_SLOTS) break;
      if (!overlapsBusy(slot, busy)) {
        slots.push({ start: slot.start.toISOString(), end: slot.end.toISOString() });
      }
    }

    return NextResponse.json({
      slug,
      title: link.title,
      duration_minutes: link.durationMinutes,
      slots,
    });
  },
  { auth: false, rateLimit: true },
);
