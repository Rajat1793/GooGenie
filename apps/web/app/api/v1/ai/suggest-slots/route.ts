/**
 * POST /api/v1/ai/suggest-slots
 *
 * Lightweight heuristic: given a duration + earliest/latest window, walk
 * 30-minute granularity slots inside business hours (09:00–18:00 local) and
 * return the first N that don't overlap any busy block from
 * Google Calendar's freebusy query.
 *
 * Returns `ai_available: true` whenever Mistral is configured (the LLM is
 * used only to generate the human-readable rationale).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { isAiAvailable, chat } from "@googenie/server/integrations/openai";
import { checkAvailability } from "@googenie/server/integrations/googlecalendar";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const suggestSlotsSchema = z.object({
  description: z.string().min(1).max(500),
  duration_minutes: z.number().int().min(15).max(480).default(30),
  earliest: z.string().datetime().optional(),
  latest: z.string().datetime().optional(),
});

const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 18;
const SLOT_GRANULARITY_MIN = 30;
const MAX_SLOTS = 5;

interface BusyBlock {
  start: number;
  end: number;
}

function buildCandidateSlots(start: Date, end: Date, durationMin: number): Array<{ start: Date; end: Date }> {
  const slots: Array<{ start: Date; end: Date }> = [];
  const durationMs = durationMin * 60 * 1000;
  const cursor = new Date(start);
  cursor.setSeconds(0, 0);
  // Round up to next half-hour boundary.
  const minutes = cursor.getMinutes();
  cursor.setMinutes(minutes + ((SLOT_GRANULARITY_MIN - (minutes % SLOT_GRANULARITY_MIN)) % SLOT_GRANULARITY_MIN));

  while (cursor.getTime() + durationMs <= end.getTime() && slots.length < 200) {
    const hour = cursor.getHours();
    if (hour >= BUSINESS_START_HOUR && hour < BUSINESS_END_HOUR) {
      slots.push({ start: new Date(cursor), end: new Date(cursor.getTime() + durationMs) });
    }
    cursor.setTime(cursor.getTime() + SLOT_GRANULARITY_MIN * 60 * 1000);
  }
  return slots;
}

function overlapsBusy(slot: { start: Date; end: Date }, busy: BusyBlock[]): boolean {
  const s = slot.start.getTime();
  const e = slot.end.getTime();
  return busy.some((b) => s < b.end && e > b.start);
}

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "calendar_create");
  if (gate) return gate;

  const parsed = await validateBody(suggestSlotsSchema, req, {
    traceId,
    message: "Invalid suggest-slots payload",
  });
  if (!parsed.ok) return parsed.response;
  const { description, duration_minutes, earliest, latest } = parsed.data;

  const now = new Date();
  const startWindow = earliest ? new Date(earliest) : now;
  const endWindow = latest ? new Date(latest) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const corsairTenant = getCorsairTenant(auth!.userId);
  const fb = await checkAvailability(corsairTenant, {
    timeMin: startWindow.toISOString(),
    timeMax: endWindow.toISOString(),
  }).catch(() => []);
  const busy: BusyBlock[] = fb.flatMap((c) =>
    c.busy.map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() })),
  );

  const candidates = buildCandidateSlots(startWindow, endWindow, duration_minutes);
  const free = candidates.filter((s) => !overlapsBusy(s, busy)).slice(0, MAX_SLOTS);

  let rationale: string | null = null;
  if (isAiAvailable() && free.length > 0) {
    const slotList = free
      .map((s) => `${s.start.toLocaleString()} – ${s.end.toLocaleString()}`)
      .join("\n");
    const llm = await chat(
      `Meeting: "${description}" (${duration_minutes} minutes).\nCandidate slots:\n${slotList}\n\nWrite ONE short sentence (max 25 words) recommending the best slot and why.`,
      "You are a calendar assistant. Be concise.",
      { maxTokens: 80 },
    ).catch(() => null);
    rationale = llm?.trim() ?? null;
  }

  return NextResponse.json({
    slots: free.map((s, i) => ({
      start: s.start.toISOString(),
      end: s.end.toISOString(),
      score: 1 - i * 0.1,
      reason: i === 0 ? "Earliest available business-hour slot" : "Alternative business-hour slot",
    })),
    rationale,
    searched_window: {
      start: startWindow.toISOString(),
      end: endWindow.toISOString(),
    },
    ai_available: isAiAvailable(),
  });
});
