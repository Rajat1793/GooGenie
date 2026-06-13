export interface CalendarEvent {
  id: string;
  tenantId: string;
  ownerUserId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  attendees: string[];
  description?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  colorId?: string;
}

const events: CalendarEvent[] = [
  {
    id: "evt-1",
    tenantId: "demo-tenant",
    ownerUserId: "user-1",
    title: "Design standup",
    startsAt: "2026-06-10T09:00:00.000Z",
    endsAt: "2026-06-10T09:30:00.000Z",
    attendees: ["design@nimbus.dev"]
  },
  {
    id: "evt-2",
    tenantId: "demo-tenant",
    ownerUserId: "user-2",
    title: "Customer triage",
    startsAt: "2026-06-10T11:00:00.000Z",
    endsAt: "2026-06-10T11:30:00.000Z",
    attendees: ["support@nimbus.dev"]
  }
];

export function listCalendarEvents(tenantId: string, allowedUserIds: Set<string>): CalendarEvent[] {
  return events.filter((event) => event.tenantId === tenantId && allowedUserIds.has(event.ownerUserId));
}

export function createCalendarEvent(input: {
  tenantId: string;
  ownerUserId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  attendees: string[];
}): CalendarEvent {
  const created: CalendarEvent = {
    id: `evt-${events.length + 1}`,
    tenantId: input.tenantId,
    ownerUserId: input.ownerUserId,
    title: input.title,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    attendees: input.attendees
  };

  events.push(created);
  return created;
}
