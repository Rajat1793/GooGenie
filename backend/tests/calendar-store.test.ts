import { describe, expect, it } from "vitest";

import { createCalendarEvent, listCalendarEvents } from "../src/domain/calendar-store.js";

describe("calendar store tenant and scope filtering", () => {
  it("lists only events for allowed users", () => {
    const events = listCalendarEvents("demo-tenant", new Set(["user-1"]));
    expect(events.map((event) => event.id)).toContain("evt-1");
    expect(events.find((event) => event.ownerUserId === "user-2")).toBeUndefined();
  });

  it("creates an event for a tenant and owner", () => {
    const created = createCalendarEvent({
      tenantId: "demo-tenant",
      ownerUserId: "user-1",
      title: "Sprint planning",
      startsAt: "2026-06-11T09:00:00.000Z",
      endsAt: "2026-06-11T09:30:00.000Z",
      attendees: ["team@nimbus.dev"]
    });

    expect(created.id).toMatch(/^evt-/);
    expect(created.ownerUserId).toBe("user-1");
  });
});
