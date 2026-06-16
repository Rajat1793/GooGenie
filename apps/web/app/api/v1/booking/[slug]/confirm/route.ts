/**
 * POST /api/v1/booking/:slug/confirm
 *
 * Public — no auth. Body: { name, email, start, notes? }.
 *   - Validates the slot still doesn't conflict (race protection).
 *   - Creates the calendar event on the owner's Google Calendar.
 *   - Adds the visitor as an attendee so they get a Google invite email.
 *   - Returns the created event id / hangoutLink (if any) so the page can
 *     show a success state with a "Add to calendar" link.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import {
  checkAvailability,
  createGCalEvent,
} from "@googenie/server/integrations/googlecalendar";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { getBookingLinkBySlug } from "@googenie/db/bookingLinks";
import { getUserById } from "@googenie/db/users";
import { paramString } from "../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const confirmSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  start: z.string().datetime(),
  notes: z.string().max(2000).optional(),
});

export const POST = withApiMiddleware(
  async (req, { traceId, params }) => {
    const slug = paramString(params.slug);
    const link = await getBookingLinkBySlug(slug);
    if (!link || !link.isActive) {
      return NextResponse.json({ error: "Booking link not found" }, { status: 404 });
    }

    const parsed = await validateBody(confirmSchema, req, {
      traceId,
      message: "Invalid booking confirm payload",
    });
    if (!parsed.ok) return parsed.response;
    const { name, email, start, notes } = parsed.data;

    const startsAt = new Date(start);
    const endsAt = new Date(startsAt.getTime() + link.durationMinutes * 60 * 1000);

    // Resolve the OWNER's Clerk id (or fall back to internal id) so we use
    // the same Corsair tenant that holds their OAuth tokens.
    const owner = await getUserById(link.userId);
    const ownerAuthId = owner?.clerkUserId ?? link.userId;
    const tenant = getCorsairTenant(ownerAuthId);
    const fb = await checkAvailability(tenant, {
      timeMin: startsAt.toISOString(),
      timeMax: endsAt.toISOString(),
    }).catch(() => []);
    const stillBusy = fb
      .flatMap((c) => c.busy)
      .some((b) => {
        const bs = new Date(b.start).getTime();
        const be = new Date(b.end).getTime();
        return bs < endsAt.getTime() && be > startsAt.getTime();
      });
    if (stillBusy) {
      return NextResponse.json(
        { error: "That slot was just booked — pick another", code: "SLOT_TAKEN" },
        { status: 409 },
      );
    }

    try {
      const created = await createGCalEvent({
        tenantId: tenant,
        ownerUserId: link.userId,
        title: `${link.title} — ${name}`,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        attendees: [email],
        description: notes
          ? `Booked via GooGenie booking link.\n\nVisitor notes:\n${notes}`
          : "Booked via GooGenie booking link.",
        withMeet: true,
      });
      return NextResponse.json({
        ok: true,
        event_id: created.id,
        starts_at: created.startsAt,
        ends_at: created.endsAt,
        meet_link: (created as { hangoutLink?: string }).hangoutLink ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create the event";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  },
  { auth: false, rateLimit: true },
);
