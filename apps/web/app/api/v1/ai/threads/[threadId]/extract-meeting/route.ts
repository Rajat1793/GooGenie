/**
 * POST /api/v1/ai/threads/[threadId]/extract-meeting
 *
 * Feature B3 — Schedule from email.
 *
 * 1. Pulls the thread (subject + snippet + sender) from Corsair.
 * 2. Asks Mistral to extract proposed meeting times in strict JSON.
 * 3. For each candidate slot, checks the user's calendar availability.
 * 4. Returns the free slots + a draft reply confirming the top pick.
 *
 * The UI renders each free slot as a chip: clicking it (a) replies on the
 * thread accepting the slot via Gmail and (b) creates the calendar event
 * with the thread's other party as an attendee — all four operations come
 * from the Corsair SDK in one user flow.
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import {
  chat,
  isAiAvailable,
  MODEL,
} from "@googenie/server/integrations/openai";
import { fetchGmailThread } from "@googenie/server/integrations/gmail";
import { checkAvailability } from "@googenie/server/integrations/googlecalendar";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { paramString } from "../../../../_lib/params";
import { checkFeature } from "../../../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CandidateSlot {
  start: string;
  end: string;
  /** Free-form label the model produced, e.g. "Tuesday 2pm" */
  label: string;
}

interface FreeSlot extends CandidateSlot {
  duration_minutes: number;
}

const SLOT_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function looksValid(iso: string): boolean {
  if (!SLOT_REGEX.test(iso)) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime());
}

function extractSenderEmail(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim();
}

export const POST = withApiMiddleware(async (req, { auth, params }) => {
  const gate = await checkFeature(req, "ai_compose");
  if (gate) return gate;
  const threadId = paramString(params.threadId);
  if (!threadId) {
    return NextResponse.json({ error: "Missing threadId" }, { status: 400 });
  }
  if (!isAiAvailable()) {
    return NextResponse.json({
      ai_available: false,
      slots: [],
      hint: "Set MISTRAL_API_KEY to enable meeting extraction.",
    });
  }

  const corsairTenant = getCorsairTenant(auth!.userId);
  const thread = await fetchGmailThread(corsairTenant, threadId, auth!.userId).catch(() => undefined);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const me =
    (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  const myName = me?.displayName ?? "there";
  const senderEmail = extractSenderEmail(thread.from);
  const todayIso = new Date().toISOString();

  // ── 1. Ask Mistral to extract candidate slots ────────────────────────────
  const extractPrompt = `You are an assistant that extracts proposed meeting times from an email.

Today's date is ${todayIso}. The user's timezone offset matches their browser; assume the times given in the email are in their local timezone.

Email:
From: ${thread.from}
Subject: ${thread.subject}
Snippet:
${(thread.snippet ?? "").slice(0, 1500)}

Output STRICT JSON only — no prose, no markdown. Schema:
{
  "intent": "scheduling" | "not_scheduling",
  "default_duration_minutes": 30,
  "candidates": [
    { "start": "ISO 8601 timestamp", "end": "ISO 8601 timestamp", "label": "human-readable" }
  ]
}

Rules:
- If the email is NOT about scheduling, return { "intent":"not_scheduling", "default_duration_minutes":30, "candidates":[] } and nothing else.
- "candidates" should include up to 5 distinct concrete times the sender proposed or implied. NEVER invent times that are not in the email.
- If the sender said "this week" or "next Tuesday" without a specific hour, propose two reasonable business-hour slots (10:00 and 14:00 local) on the implied day.
- Default duration is 30 minutes unless the email says otherwise.
- Use future timestamps only — never propose times in the past relative to today.`;

  let extracted: {
    intent?: string;
    default_duration_minutes?: number;
    candidates?: CandidateSlot[];
  } = {};
  const raw = await chat(extractPrompt, "You return ONLY valid JSON.", {
    jsonMode: true,
    maxTokens: 600,
  }).catch(() => null);
  if (raw) {
    try {
      extracted = JSON.parse(raw);
    } catch {
      extracted = {};
    }
  }

  if (extracted.intent === "not_scheduling" || !extracted.candidates?.length) {
    return NextResponse.json({
      ai_available: true,
      scheduling: false,
      candidates: [],
      free_slots: [],
      thread: {
        id: thread.id,
        subject: thread.subject,
        from: thread.from,
        sender_email: senderEmail,
      },
      model: MODEL,
    });
  }

  const duration = Math.max(15, Math.min(240, extracted.default_duration_minutes ?? 30));

  // De-duplicate + drop past / malformed entries.
  const now = Date.now();
  const candidates: CandidateSlot[] = [];
  const seen = new Set<string>();
  for (const c of extracted.candidates) {
    if (!c?.start || !c?.end) continue;
    if (!looksValid(c.start) || !looksValid(c.end)) continue;
    const startMs = new Date(c.start).getTime();
    const endMs = new Date(c.end).getTime();
    if (startMs < now || endMs <= startMs) continue;
    const key = `${c.start}|${c.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ start: c.start, end: c.end, label: c.label ?? c.start });
    if (candidates.length >= 5) break;
  }

  // ── 2. Filter to actually-free slots via Corsair Calendar ────────────────
  const free: FreeSlot[] = [];
  for (const c of candidates) {
    try {
      const fb = await checkAvailability(corsairTenant, {
        timeMin: c.start,
        timeMax: c.end,
      });
      const busy = fb.flatMap((cal) => cal.busy);
      const overlaps = busy.some((b) => {
        const bs = new Date(b.start).getTime();
        const be = new Date(b.end).getTime();
        const s = new Date(c.start).getTime();
        const e = new Date(c.end).getTime();
        return bs < e && be > s;
      });
      if (!overlaps) {
        free.push({ ...c, duration_minutes: duration });
      }
    } catch {
      // If availability check fails (token expired etc.), surface the candidate
      // anyway — the user can decide.
      free.push({ ...c, duration_minutes: duration });
    }
  }

  // ── 3. Draft a reply confirming the top free slot ────────────────────────
  let draftReply: string | null = null;
  if (free.length > 0) {
    const top = free[0];
    const startLabel = new Date(top.start).toLocaleString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const replyPrompt = `Write a 2-3 sentence email reply confirming the time below. Friendly, brief. Sign as "${myName}". No subject line, no greeting fluff.

Original subject: ${thread.subject}
Confirmed time: ${startLabel}
Duration: ${duration} minutes`;
    draftReply = (await chat(replyPrompt, "You write concise, friendly email replies.", { maxTokens: 220 }).catch(() => null))?.trim() ?? null;
  }

  return NextResponse.json({
    ai_available: true,
    scheduling: true,
    duration_minutes: duration,
    candidates,
    free_slots: free,
    draft_reply: draftReply,
    thread: {
      id: thread.id,
      subject: thread.subject,
      from: thread.from,
      sender_email: senderEmail,
    },
    model: MODEL,
  });
});
