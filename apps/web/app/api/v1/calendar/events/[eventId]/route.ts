import { NextResponse } from "next/server";
import { withApiMiddleware, publish } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { updateCalendarEventSchema } from "@googenie/server/contracts/schemas";
import {
  deleteGCalEvent,
  getCalendarEvent,
  updateGCalEvent,
} from "@googenie/server/integrations/googlecalendar";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature, notFound } from "../../../_lib/scope";
import { paramString } from "../../../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth, traceId, params }) => {
  const gate = await checkFeature(req, "calendar_read");
  if (gate) return gate;
  const eventId = paramString(params.eventId);
  const event = await getCalendarEvent(getCorsairTenant(auth!.userId), auth!.userId, eventId);
  if (!event) return notFound("Event not found", traceId);
  return NextResponse.json({ event });
});

export const PATCH = withApiMiddleware(async (req, { auth, traceId, params }) => {
  const gate = await checkFeature(req, "calendar_write");
  if (gate) return gate;
  const eventId = paramString(params.eventId);
  const parsed = await validateBody(updateCalendarEventSchema, req, { traceId, message: "Invalid calendar event update payload" });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const updated = await updateGCalEvent({
    tenantId: getCorsairTenant(auth!.userId),
    ownerUserId: auth!.userId,
    eventId,
    title: body.title,
    startsAt: body.starts_at,
    endsAt: body.ends_at,
    attendees: body.attendees,
  });
  publish({ kind: "calendar.changed", userId: auth!.userId, eventId: updated.id });
  return NextResponse.json({ event: updated });
});

export const DELETE = withApiMiddleware(async (req, { auth, params }) => {
  const gate = await checkFeature(req, "calendar_write");
  if (gate) return gate;
  const eventId = paramString(params.eventId);
  await deleteGCalEvent(getCorsairTenant(auth!.userId), eventId);
  publish({ kind: "calendar.changed", userId: auth!.userId, eventId });
  return new NextResponse(null, { status: 204 });
});
