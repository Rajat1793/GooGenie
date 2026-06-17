/**
 * Conflict resolver (Feature C3 — AI calendar conflict resolver).
 *
 * When the user tries to create an event that overlaps with an existing one,
 * this module:
 *   1. Identifies all overlapping events
 *   2. Asks Mistral which one is more important and which to move
 *   3. Returns a structured suggestion with a draft email to the displaced
 *      attendees
 */
import { fetchCalendarEvents } from "./googlecalendar";
import type { CalendarEvent } from "../domain/calendar-store";
import { chat, isAiAvailable, MODEL } from "./openai";

export interface ConflictResolution {
  hasConflicts: boolean;
  conflicts: CalendarEvent[];
  /** Which event should yield (move/cancel). null when AI says new event yields. */
  suggestedToMove: { eventId: string; reason: string } | null;
  /** Whether the new event should be moved instead of the conflict. */
  newEventYields: boolean;
  /** Optional human-readable summary from the AI. */
  summary: string | null;
  /** Draft email to attendees of the displaced event. */
  draftReply: string | null;
  ai_available: boolean;
}

/**
 * Find all events that overlap a candidate time window.
 */
export async function findCalendarConflicts(opts: {
  tenantId: string;
  userId: string;
  startsAt: string;
  endsAt: string;
}): Promise<CalendarEvent[]> {
  const { tenantId, userId, startsAt, endsAt } = opts;
  // Fetch a slightly wider window so we catch events that start before / end after.
  const windowStart = new Date(new Date(startsAt).getTime() - 24 * 3600 * 1000).toISOString();
  const windowEnd = new Date(new Date(endsAt).getTime() + 24 * 3600 * 1000).toISOString();
  const events = await fetchCalendarEvents(tenantId, userId, {
    timeMin: windowStart,
    timeMax: windowEnd,
    maxResults: 30,
  });

  const newStart = new Date(startsAt).getTime();
  const newEnd = new Date(endsAt).getTime();
  return events.filter((ev) => {
    const evStart = new Date(ev.startsAt).getTime();
    const evEnd = new Date(ev.endsAt).getTime();
    return evStart < newEnd && evEnd > newStart;
  });
}

/**
 * Full conflict resolution flow:
 *   1. Find overlapping events
 *   2. Ask Mistral which to keep
 *   3. Return suggestion + draft email
 */
export async function resolveCalendarConflicts(opts: {
  tenantId: string;
  userId: string;
  startsAt: string;
  endsAt: string;
  title: string;
  attendees: string[];
}): Promise<ConflictResolution> {
  const { tenantId, userId, startsAt, endsAt, title, attendees } = opts;
  const conflicts = await findCalendarConflicts({ tenantId, userId, startsAt, endsAt });

  if (conflicts.length === 0) {
    return {
      hasConflicts: false,
      conflicts: [],
      suggestedToMove: null,
      newEventYields: false,
      summary: null,
      draftReply: null,
      ai_available: isAiAvailable(),
    };
  }

  if (!isAiAvailable()) {
    // Fallback: suggest moving the first conflict (preserve new event preference).
    return {
      hasConflicts: true,
      conflicts,
      suggestedToMove: { eventId: conflicts[0].id, reason: "First overlapping event" },
      newEventYields: false,
      summary: `${conflicts.length} conflicting event(s). Configure MISTRAL_API_KEY for AI-powered resolution.`,
      draftReply: null,
      ai_available: false,
    };
  }

  // Build context for AI ranking.
  const conflictDescriptions = conflicts.map((c, i) => {
    const start = new Date(c.startsAt).toLocaleString();
    const dur = Math.round((new Date(c.endsAt).getTime() - new Date(c.startsAt).getTime()) / 60000);
    return `${i + 1}. id="${c.id}" — "${c.title}" at ${start} (${dur} min, ${c.attendees.length} attendees: ${c.attendees.slice(0, 4).join(", ")})`;
  }).join("\n");

  const prompt = `The user wants to schedule a NEW event:
- Title: "${title}"
- When: ${new Date(startsAt).toLocaleString()} – ${new Date(endsAt).toLocaleString()}
- Attendees: ${attendees.slice(0, 5).join(", ") || "none"}

But these existing events conflict:
${conflictDescriptions}

Which one should win? Consider:
- Larger meetings with external attendees usually outrank 1:1s and recurring syncs
- "Sync", "stand-up", "review" implies recurring → easier to move
- Meetings the user already moved twice are often deprioritized

Respond with STRICT JSON:
{
  "winner": "new" | "<conflict-id>",
  "to_move_id": "<conflict-id>" | null,
  "reason": "<one-sentence why>",
  "draft_email": "<2-sentence email to attendees of the moved event explaining the reschedule, no greeting/signature>" | null
}

If "winner" is "new", to_move_id MUST be one of the conflict ids.
If "winner" is a conflict id, to_move_id MUST be null and the new event should yield.`;

  const raw = await chat(prompt, "You return ONLY valid JSON.", { jsonMode: true, maxTokens: 500 }).catch(() => null);
  if (!raw) {
    return {
      hasConflicts: true,
      conflicts,
      suggestedToMove: { eventId: conflicts[0].id, reason: "AI unavailable" },
      newEventYields: false,
      summary: null,
      draftReply: null,
      ai_available: true,
    };
  }

  try {
    const parsed = JSON.parse(raw) as {
      winner?: string;
      to_move_id?: string | null;
      reason?: string;
      draft_email?: string | null;
    };
    const newEventYields = parsed.winner !== "new";
    const validIds = new Set(conflicts.map((c) => c.id));
    let suggestedToMove: ConflictResolution["suggestedToMove"] = null;
    if (!newEventYields && parsed.to_move_id && validIds.has(parsed.to_move_id)) {
      suggestedToMove = {
        eventId: parsed.to_move_id,
        reason: parsed.reason ?? "AI suggested",
      };
    } else if (newEventYields) {
      suggestedToMove = null;
    }

    return {
      hasConflicts: true,
      conflicts,
      suggestedToMove,
      newEventYields,
      summary: parsed.reason ?? null,
      draftReply: parsed.draft_email ?? null,
      ai_available: true,
    };
  } catch {
    return {
      hasConflicts: true,
      conflicts,
      suggestedToMove: { eventId: conflicts[0].id, reason: "Parse failure" },
      newEventYields: false,
      summary: null,
      draftReply: null,
      ai_available: true,
    };
  }
}

export const CONFLICT_RESOLVER_MODEL = MODEL;
