import { NextResponse } from "next/server";
import { withApiMiddleware, publish, paginate } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { createCalendarEventSchema } from "@googenie/server/contracts/schemas";
import { fetchCalendarEvents, createGCalEvent } from "@googenie/server/integrations/googlecalendar";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature, forbidden, getScopedUserIds } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "calendar_read");
  if (gate) return gate;
  const url = new URL(req.url);
  const requestedUserId = url.searchParams.get("userId") ?? auth!.userId;
  if (!getScopedUserIds(auth!).has(requestedUserId)) {
    return forbidden("Requested user is out of scope", traceId);
  }
  const events = await fetchCalendarEvents(getCorsairTenant(auth!.userId), requestedUserId, {
    timeMin: url.searchParams.get("timeMin") ?? undefined,
    timeMax: url.searchParams.get("timeMax") ?? undefined,
  });
  const page = paginate(events, url.searchParams.get("cursor") ?? undefined, url.searchParams.get("limit") ?? undefined);
  return NextResponse.json({ events: page.items, total: page.total, next_cursor: page.next_cursor });
});

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "calendar_write");
  if (gate) return gate;
  const parsed = await validateBody(createCalendarEventSchema, req, { traceId, message: "Invalid calendar event payload" });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const created = await createGCalEvent({
    tenantId: getCorsairTenant(auth!.userId),
    ownerUserId: auth!.userId,
    title: body.title,
    startsAt: body.starts_at,
    endsAt: body.ends_at,
    attendees: body.attendees,
    description: body.description,
    location: body.location,
    withMeet: body.with_meet,
  });
  publish({ kind: "calendar.changed", userId: auth!.userId, eventId: created.id });
  return NextResponse.json({ event: created }, { status: 201 });
});
