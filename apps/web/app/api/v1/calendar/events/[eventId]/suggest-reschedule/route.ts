/**
 * POST /api/v1/calendar/events/[eventId]/suggest-reschedule
 *
 * Feature B2 — Smart reschedule.
 *
 * For a given calendar event:
 *   1. Pull attendees from Corsair calendar
 *   2. Check free/busy for each (when available)
 *   3. Mistral picks 3 best alternative slots
 *   4. Return draft email with options
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { chat, isAiAvailable, MODEL } from "@googenie/server/integrations/openai";
import { getCalendarEvent, checkAvailability } from "@googenie/server/integrations/googlecalendar";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { paramString } from "../../../../_lib/params";
import { checkFeature } from "../../../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiMiddleware(async (req, { auth, params }) => {
  const gate = await checkFeature(req, "ai_smart_reschedule");
  if (gate) return gate;

  const eventId = paramString(params.eventId);
  if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 });

  const tenant = getCorsairTenant(auth!.userId);
  const event = await getCalendarEvent(tenant, auth!.userId, eventId).catch(() => null);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (!isAiAvailable()) {
    return NextResponse.json({
      ai_available: false,
      suggestions: [],
      hint: "Set MISTRAL_API_KEY to generate reschedule suggestions.",
    });
  }

  // Find 3-day window around the original event.
  const origStart = new Date(event.startsAt);
  const origEnd = new Date(event.endsAt);
  const durationMs = origEnd.getTime() - origStart.getTime();
  const scanStart = new Date(origStart.getTime() - 1 * 24 * 3600 * 1000);
  const scanEnd = new Date(origStart.getTime() + 3 * 24 * 3600 * 1000);

  // Check free/busy for the user (we can't easily check external attendees without their tokens).
  const fb = await checkAvailability(tenant, {
    timeMin: scanStart.toISOString(),
    timeMax: scanEnd.toISOString(),
  });
  const busySlots = fb.flatMap((cal) => cal.busy);

  // Generate candidate slots (every 30 min during business hours).
  const candidates: Array<{ start: string; end: string; label: string }> = [];
  for (let dayOffset = -1; dayOffset <= 3; dayOffset++) {
    const dayStart = new Date(origStart);
    dayStart.setDate(dayStart.getDate() + dayOffset);
    dayStart.setHours(9, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(17, 0, 0, 0);

    for (let hour = 9; hour < 17; hour++) {
      for (let min = 0; min < 60; min += 30) {
        const slotStart = new Date(dayStart);
        slotStart.setHours(hour, min, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + durationMs);
        if (slotEnd.getTime() > dayEnd.getTime()) continue;

        // Skip if conflicts with existing busy.
        const conflicts = busySlots.some((b) => {
          const bs = new Date(b.start).getTime();
          const be = new Date(b.end).getTime();
          return bs < slotEnd.getTime() && be > slotStart.getTime();
        });
        if (conflicts) continue;

        candidates.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          label: slotStart.toLocaleString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
        if (candidates.length >= 20) break;
      }
      if (candidates.length >= 20) break;
    }
    if (candidates.length >= 20) break;
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      ai_available: true,
      suggestions: [],
      hint: "No free slots found in the next 3 days during business hours.",
    });
  }

  // Ask Mistral to pick the best 3.
  const prompt = `The user needs to reschedule "${event.title}" originally at ${event.startsAt}. Here are ${candidates.length} free slots:
${candidates.map((c, i) => `${i + 1}. ${c.label}`).join("\n")}

Pick the top 3 slots that:
- Are not too early or late in the day
- Spread across different days if possible
- Avoid Friday afternoons

Return STRICT JSON: { "picks": [index1, index2, index3] } where each index is 1-based.`;

  const raw = await chat(prompt, "You return ONLY valid JSON.", { jsonMode: true, maxTokens: 150 }).catch(() => null);
  let picks = [0, 1, 2];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { picks?: number[] };
      if (Array.isArray(parsed.picks) && parsed.picks.length >= 3) {
        picks = parsed.picks.slice(0, 3).map((p) => Math.max(0, Math.min(candidates.length - 1, p - 1)));
      }
    } catch {
      /* use default */
    }
  }

  const suggestions = picks.map((i) => candidates[i]);

  // Draft email.
  const draftPrompt = `Write a polite 2-sentence email proposing 3 new times for "${event.title}". Times:
1. ${suggestions[0].label}
2. ${suggestions[1].label}
3. ${suggestions[2].label}

Ask which works best. No greeting/signature.`;
  const draft = (await chat(draftPrompt, "You write concise emails.", { maxTokens: 180 }).catch(() => null))?.trim() ?? null;

  return NextResponse.json({
    ai_available: true,
    original_event: { id: event.id, title: event.title, starts_at: event.startsAt },
    suggestions,
    draft_email: draft,
    model: MODEL,
  });
});
