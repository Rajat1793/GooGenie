/**
 * Google Calendar integration wrapper — normalizes Corsair Calendar API
 * responses into the CalendarEvent shape used by content routes.
 *
 * Falls back to the in-memory store when the tenant has not connected Calendar.
 */
import { corsair, isCorsairConfigured } from "./corsair.js";
import { listCalendarEvents, createCalendarEvent } from "../domain/calendar-store.js";
import type { CalendarEvent } from "../domain/calendar-store.js";

/**
 * List calendar events for a tenant/user from Google Calendar.
 * Returns normalized CalendarEvent[] compatible with the existing API contract.
 */
export async function fetchCalendarEvents(
  tenantId: string,
  userId: string,
  options: { timeMin?: string; timeMax?: string; maxResults?: number } = {}
): Promise<CalendarEvent[]> {
  if (!isCorsairConfigured()) {
    return listCalendarEvents(tenantId, new Set([userId]));
  }

  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (tenant as any).googlecalendar.api.events.getMany({
      calendarId: "primary",
      timeMin: options.timeMin ?? new Date().toISOString(),
      maxResults: options.maxResults ?? 10,
      singleEvents: true,
      orderBy: "startTime",
      ...(options.timeMax ? { timeMax: options.timeMax } : {})
    });

    const rawEvents: Array<{
      id?: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      attendees?: Array<{ email?: string }>;
    }> = (result?.items ?? []).filter((e: { eventType?: string }) =>
      // Filter out event types Corsair's schema doesn't support (e.g. "birthday")
      !e.eventType || ["default", "outOfOffice", "focusTime", "workingLocation"].includes(e.eventType)
    );

    return rawEvents.map((e) => ({
      id: e.id ?? crypto.randomUUID(),
      tenantId,
      ownerUserId: userId,
      title: e.summary ?? "Untitled event",
      startsAt: e.start?.dateTime ?? e.start?.date ?? new Date().toISOString(),
      endsAt: e.end?.dateTime ?? e.end?.date ?? new Date().toISOString(),
      attendees: (e.attendees ?? []).map((a) => a.email ?? "").filter(Boolean)
    }));
  } catch {
    // Tenant not connected or token expired — fall back to mock data
    return listCalendarEvents(tenantId, new Set([userId]));
  }
}

/**
 * Create a calendar event in Google Calendar on behalf of a tenant/user.
 * Falls back to the in-memory store if Corsair is not configured.
 */
export async function createGCalEvent(input: {
  tenantId: string;
  ownerUserId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  attendees: string[];
}): Promise<CalendarEvent> {
  if (!isCorsairConfigured()) {
    return createCalendarEvent(input);
  }

  try {
    const tenant = corsair.withTenant(input.tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await (tenant as any).googlecalendar.api.events.create({
      calendarId: "primary",
      event: {
        summary: input.title,
        start: { dateTime: input.startsAt },
        end: { dateTime: input.endsAt },
        attendees: input.attendees.map((email) => ({ email }))
      }
    });

    return {
      id: created?.id ?? crypto.randomUUID(),
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      title: created?.summary ?? input.title,
      startsAt: created?.start?.dateTime ?? created?.start?.date ?? input.startsAt,
      endsAt: created?.end?.dateTime ?? created?.end?.date ?? input.endsAt,
      attendees: (created?.attendees ?? []).map((a: { email?: string }) => a.email ?? "").filter(Boolean)
    };
  } catch {
    // Fall back to in-memory store on any Corsair error
    return createCalendarEvent(input);
  }
}

/**
 * Update an existing calendar event.
 * Falls back to a no-op returning the input as-is if Corsair is not configured.
 */
export async function updateGCalEvent(input: {
  tenantId: string;
  ownerUserId: string;
  eventId: string;
  title?: string;
  startsAt?: string;
  endsAt?: string;
  attendees?: string[];
}): Promise<CalendarEvent> {
  if (!isCorsairConfigured()) {
    // No persistent store for updates in demo mode — return synthetic updated event
    return {
      id: input.eventId,
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      title: input.title ?? "Updated event",
      startsAt: input.startsAt ?? new Date().toISOString(),
      endsAt: input.endsAt ?? new Date().toISOString(),
      attendees: input.attendees ?? []
    };
  }

  try {
    const tenant = corsair.withTenant(input.tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (tenant as any).googlecalendar.api.events.update({
      calendarId: "primary",
      id: input.eventId,
      event: {
        ...(input.title ? { summary: input.title } : {}),
        ...(input.startsAt ? { start: { dateTime: input.startsAt } } : {}),
        ...(input.endsAt ? { end: { dateTime: input.endsAt } } : {}),
        ...(input.attendees ? { attendees: input.attendees.map((email) => ({ email })) } : {})
      }
    });

    return {
      id: updated?.id ?? input.eventId,
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      title: updated?.summary ?? input.title ?? "Updated event",
      startsAt: updated?.start?.dateTime ?? updated?.start?.date ?? input.startsAt ?? new Date().toISOString(),
      endsAt: updated?.end?.dateTime ?? updated?.end?.date ?? input.endsAt ?? new Date().toISOString(),
      attendees: (updated?.attendees ?? []).map((a: { email?: string }) => a.email ?? "").filter(Boolean)
    };
  } catch {
    return {
      id: input.eventId,
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      title: input.title ?? "Updated event",
      startsAt: input.startsAt ?? new Date().toISOString(),
      endsAt: input.endsAt ?? new Date().toISOString(),
      attendees: input.attendees ?? []
    };
  }
}

/**
 * Check calendar availability (free/busy) for a list of calendar IDs.
 */
export async function checkAvailability(
  tenantId: string,
  opts: { timeMin: string; timeMax: string; calendarIds?: string[] }
): Promise<Array<{ calendarId: string; busy: Array<{ start: string; end: string }> }>> {
  if (!isCorsairConfigured()) {
    return [];
  }

  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (tenant as any).googlecalendar.api.calendar.getAvailability({
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
      items: (opts.calendarIds ?? ["primary"]).map((id) => ({ id }))
    });

    const calendars: Record<string, { busy?: Array<{ start?: string; end?: string }> }> =
      result?.calendars ?? {};

    return Object.entries(calendars).map(([calendarId, cal]) => ({
      calendarId,
      busy: (cal.busy ?? []).map((b) => ({
        start: b.start ?? opts.timeMin,
        end: b.end ?? opts.timeMax
      }))
    }));
  } catch {
    return [];
  }
}

