/**
 * Google Calendar integration — full Corsair Calendar API surface.
 * Uses DB search (googlecalendar.db.events.search) for near-zero latency search.
 */
import { corsair, isCorsairConfigured } from "./corsair.js";
import { listCalendarEvents, createCalendarEvent } from "../domain/calendar-store.js";
import type { CalendarEvent } from "../domain/calendar-store.js";
import { cache, TTL } from "../security/cache.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeEvent(e: any, tenantId: string, userId: string): CalendarEvent {
  return {
    id: e.id ?? crypto.randomUUID(),
    tenantId,
    ownerUserId: userId,
    title: e.summary ?? "Untitled event",
    startsAt: e.start?.dateTime ?? e.start?.date ?? new Date().toISOString(),
    endsAt: e.end?.dateTime ?? e.end?.date ?? new Date().toISOString(),
    attendees: (e.attendees ?? []).map((a: any) => a.email ?? "").filter(Boolean),
    description: e.description,
    location: e.location,
    htmlLink: e.htmlLink,
    status: e.status,
    colorId: e.colorId,
  };
}

// ── fetchCalendarEvents — uses DB search for speed ────────────────────────────

export async function fetchCalendarEvents(
  tenantId: string,
  userId: string,
  options: { timeMin?: string; timeMax?: string; maxResults?: number; searchQuery?: string } = {}
): Promise<CalendarEvent[]> {
  if (!isCorsairConfigured()) return listCalendarEvents(tenantId, new Set([userId]));

  const cacheKey = `events:${tenantId}:${userId}:${JSON.stringify(options)}`;
  const cached = cache.get<CalendarEvent[]>(cacheKey);
  if (cached) return cached;

  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tenant as any;

    // Use DB search for text queries (near-zero latency)
    if (options.searchQuery) {
      try {
        const dbResults = await t.googlecalendar.db.events.search({
          data: {
            OR: [
              { summary: { contains: options.searchQuery } },
              { description: { contains: options.searchQuery } },
              { location: { contains: options.searchQuery } },
            ],
          },
          limit: options.maxResults ?? 10,
        });
        if (dbResults?.length > 0) {
          const events = dbResults.map((e: any) => normalizeEvent(e, tenantId, userId));
          cache.set(cacheKey, events, TTL.CALENDAR);
          return events;
        }
      } catch { /* fall through to API */ }
    }

    const result = await t.googlecalendar.api.events.getMany({
      calendarId: "primary",
      timeMin: options.timeMin ?? new Date().toISOString(),
      maxResults: options.maxResults ?? 10,
      singleEvents: true,
      orderBy: "startTime",
      ...(options.timeMax ? { timeMax: options.timeMax } : {}),
      ...(options.searchQuery ? { q: options.searchQuery } : {}),
    });

    const rawEvents = (result?.items ?? []).filter((e: any) =>
      !e.eventType || ["default", "outOfOffice", "focusTime", "workingLocation"].includes(e.eventType)
    );

    const events = rawEvents.map((e: any) => normalizeEvent(e, tenantId, userId));
    cache.set(cacheKey, events, TTL.CALENDAR);
    return events;
  } catch {
    return listCalendarEvents(tenantId, new Set([userId]));
  }
}

// ── getCalendarEvent ──────────────────────────────────────────────────────────

export async function getCalendarEvent(tenantId: string, userId: string, eventId: string): Promise<CalendarEvent | null> {
  const cacheKey = `event:${tenantId}:${eventId}`;
  const cached = cache.get<CalendarEvent>(cacheKey);
  if (cached) return cached;
  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = await (tenant as any).googlecalendar.api.events.get({ id: eventId, calendarId: "primary" });
    if (!e) return null;
    const event = normalizeEvent(e, tenantId, userId);
    cache.set(cacheKey, event, TTL.CALENDAR);
    return event;
  } catch { return null; }
}

// ── createGCalEvent ───────────────────────────────────────────────────────────

export async function createGCalEvent(input: { tenantId: string; ownerUserId: string; title: string; startsAt: string; endsAt: string; attendees: string[]; description?: string; location?: string }): Promise<CalendarEvent> {
  if (!isCorsairConfigured()) return createCalendarEvent(input);
  try {
    const tenant = corsair.withTenant(input.tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await (tenant as any).googlecalendar.api.events.create({
      calendarId: "primary",
      event: {
        summary: input.title,
        start: { dateTime: input.startsAt },
        end: { dateTime: input.endsAt },
        attendees: input.attendees.map((email) => ({ email })),
        ...(input.description ? { description: input.description } : {}),
        ...(input.location ? { location: input.location } : {}),
      },
    });
    cache.invalidatePrefix(`events:${input.tenantId}`);
    return normalizeEvent(created, input.tenantId, input.ownerUserId);
  } catch {
    return createCalendarEvent(input);
  }
}

// ── updateGCalEvent ───────────────────────────────────────────────────────────

export async function updateGCalEvent(input: { tenantId: string; ownerUserId: string; eventId: string; title?: string; startsAt?: string; endsAt?: string; attendees?: string[]; description?: string; location?: string }): Promise<CalendarEvent> {
  if (!isCorsairConfigured()) {
    return { id: input.eventId, tenantId: input.tenantId, ownerUserId: input.ownerUserId, title: input.title ?? "Updated event", startsAt: input.startsAt ?? new Date().toISOString(), endsAt: input.endsAt ?? new Date().toISOString(), attendees: input.attendees ?? [] };
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
        ...(input.attendees ? { attendees: input.attendees.map((email) => ({ email })) } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
      },
    });
    cache.invalidatePrefix(`events:${input.tenantId}`);
    cache.delete(`event:${input.tenantId}:${input.eventId}`);
    return normalizeEvent(updated, input.tenantId, input.ownerUserId);
  } catch {
    return { id: input.eventId, tenantId: input.tenantId, ownerUserId: input.ownerUserId, title: input.title ?? "Updated event", startsAt: input.startsAt ?? new Date().toISOString(), endsAt: input.endsAt ?? new Date().toISOString(), attendees: input.attendees ?? [] };
  }
}

// ── deleteGCalEvent ───────────────────────────────────────────────────────────

export async function deleteGCalEvent(tenantId: string, eventId: string): Promise<void> {
  const tenant = corsair.withTenant(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (tenant as any).googlecalendar.api.events.delete({ id: eventId, calendarId: "primary" });
  cache.invalidatePrefix(`events:${tenantId}`);
  cache.delete(`event:${tenantId}:${eventId}`);
}

// ── checkAvailability ─────────────────────────────────────────────────────────

export async function checkAvailability(tenantId: string, opts: { timeMin: string; timeMax: string; calendarIds?: string[] }): Promise<Array<{ calendarId: string; busy: Array<{ start: string; end: string }> }>> {
  if (!isCorsairConfigured()) return [];
  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (tenant as any).googlecalendar.api.calendar.getAvailability({
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
      items: (opts.calendarIds ?? ["primary"]).map((id) => ({ id })),
    });
    const calendars: Record<string, { busy?: Array<{ start?: string; end?: string }> }> = result?.calendars ?? {};
    return Object.entries(calendars).map(([calendarId, cal]) => ({
      calendarId,
      busy: (cal.busy ?? []).map((b) => ({ start: b.start ?? opts.timeMin, end: b.end ?? opts.timeMax })),
    }));
  } catch { return []; }
}
