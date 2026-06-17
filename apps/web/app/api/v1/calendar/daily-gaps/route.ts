/**
 * GET /api/v1/calendar/daily-gaps
 *
 * Feature B5 — Calendar holes filler.
 *
 * Scans today's calendar for gaps >= 90 minutes. For each gap, surfaces the
 * "reply-needed" inbox from A2 so the user can batch-reply during free time.
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { fetchCalendarEvents } from "@googenie/server/integrations/googlecalendar";
import { fetchReplyNeededThreads } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Gap {
  start: string;
  end: string;
  durationMinutes: number;
}

export const GET = withApiMiddleware(async (req, { auth }) => {
  const gate = await checkFeature(req, "ai_daily_gaps");
  if (gate) return gate;

  const me = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  const tenant = getCorsairTenant(auth!.userId);

  // Scan today's calendar.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const events = await fetchCalendarEvents(tenant, auth!.userId, {
    timeMin: todayStart.toISOString(),
    timeMax: todayEnd.toISOString(),
    maxResults: 50,
  });

  // Sort by start time.
  const sorted = events.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  // Find gaps >= 90 min.
  const gaps: Gap[] = [];
  const workdayStart = new Date();
  workdayStart.setHours(9, 0, 0, 0);
  const workdayEnd = new Date();
  workdayEnd.setHours(17, 0, 0, 0);

  let cursor = workdayStart.getTime();
  for (const ev of sorted) {
    const evStart = new Date(ev.startsAt).getTime();
    const evEnd = new Date(ev.endsAt).getTime();
    if (evStart > cursor) {
      const gapMin = (evStart - cursor) / (1000 * 60);
      if (gapMin >= 90) {
        gaps.push({
          start: new Date(cursor).toISOString(),
          end: new Date(evStart).toISOString(),
          durationMinutes: Math.floor(gapMin),
        });
      }
    }
    cursor = Math.max(cursor, evEnd);
  }
  // Check final gap until end of workday.
  if (cursor < workdayEnd.getTime()) {
    const gapMin = (workdayEnd.getTime() - cursor) / (1000 * 60);
    if (gapMin >= 90) {
      gaps.push({
        start: new Date(cursor).toISOString(),
        end: workdayEnd.toISOString(),
        durationMinutes: Math.floor(gapMin),
      });
    }
  }

  // Pull reply-needed inbox (Feature A2).
  const replyNeeded = await fetchReplyNeededThreads(tenant, auth!.userId, me?.email ?? null, 20);

  return NextResponse.json({
    date: todayStart.toISOString(),
    gaps,
    reply_needed_count: replyNeeded.length,
    reply_needed_threads: replyNeeded.slice(0, 10),
  });
});
