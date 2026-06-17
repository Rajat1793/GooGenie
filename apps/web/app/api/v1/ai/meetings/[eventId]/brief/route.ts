/**
 * POST /api/v1/ai/meetings/[eventId]/brief
 *
 * Feature B1 — Meeting brief.
 *
 * For a given calendar event:
 *   1. Pull the event (title, attendees, start) from Corsair calendar cache.
 *   2. For each attendee, fetch their last 3 threads with the user via
 *      Corsair's local Gmail DB (`fetchThreadsWithEmail`).
 *   3. Vector-search past emails semantically related to the event title.
 *   4. Synthesize a 1-paragraph brief with Mistral.
 *
 * Every data source is Corsair-backed — no extra Gmail API calls beyond
 * the initial event lookup.
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { chat, embed, isAiAvailable, MODEL } from "@googenie/server/integrations/openai";
import { getCalendarEvent } from "@googenie/server/integrations/googlecalendar";
import { fetchThreadsWithEmail } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { embeddingsAvailable, searchEmbeddings } from "@googenie/db/embeddings";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { paramString } from "../../../../_lib/params";
import { checkFeature } from "../../../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTENDEES_TO_SCAN = 6;

export const POST = withApiMiddleware(async (req, { auth, params }) => {
  const gate = await checkFeature(req, "ai_meeting_brief");
  if (gate) return gate;

  const eventId = paramString(params.eventId);
  if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 });

  const tenant = getCorsairTenant(auth!.userId);
  const event = await getCalendarEvent(tenant, auth!.userId, eventId).catch(() => null);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const me = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  const myEmail = me?.email ?? null;

  // ── 1. Per-attendee thread slices (excluding the user themself) ──────────
  const attendees = (event.attendees ?? [])
    .filter((a): a is string => typeof a === "string" && a.length > 0)
    .filter((a) => !myEmail || a.toLowerCase() !== myEmail.toLowerCase())
    .slice(0, MAX_ATTENDEES_TO_SCAN);

  const perAttendee = await Promise.all(
    attendees.map(async (email) => ({
      email,
      recent_threads: await fetchThreadsWithEmail(tenant, email, myEmail, 3),
    })),
  );

  // ── 2. Semantic search for past emails about the same topic ─────────────
  let related: Array<{ thread_id: string; subject: string; from: string; snippet: string; similarity?: number }> = [];
  if (isAiAvailable() && (await embeddingsAvailable())) {
    const queryVec = await embed(`${event.title}\n\nAttendees: ${attendees.join(", ")}`);
    if (queryVec) {
      const hits = await searchEmbeddings(auth!.userId, queryVec, 5);
      related = hits.map((h) => ({
        thread_id: h.thread_id,
        subject: h.subject ?? "(no subject)",
        from: h.from_addr ?? "",
        snippet: (h.snippet ?? "").slice(0, 200),
        similarity: h.similarity,
      }));
    }
  }

  // ── 3. Synthesize the brief ──────────────────────────────────────────────
  let brief: string | null = null;
  let hint: string | undefined;
  if (!isAiAvailable()) {
    hint = "Set MISTRAL_API_KEY to generate the AI brief — context above is still useful.";
  } else {
    const ctxLines: string[] = [];
    ctxLines.push(`Meeting: "${event.title}"`);
    ctxLines.push(`Time: ${event.startsAt} → ${event.endsAt}`);
    if (attendees.length > 0) ctxLines.push(`Attendees: ${attendees.join(", ")}`);
    if (perAttendee.some((p) => p.recent_threads.length > 0)) {
      ctxLines.push(`\nRecent email history with attendees:`);
      for (const p of perAttendee) {
        if (p.recent_threads.length === 0) continue;
        ctxLines.push(`- ${p.email}:`);
        for (const t of p.recent_threads) {
          ctxLines.push(`  • [${t.direction}] "${t.subject}" — ${t.snippet.slice(0, 160)}`);
        }
      }
    }
    if (related.length > 0) {
      ctxLines.push(`\nRelated past emails (semantic match):`);
      for (const r of related.slice(0, 3)) {
        ctxLines.push(`- "${r.subject}" from ${r.from} — ${r.snippet.slice(0, 160)}`);
      }
    }
    const briefPrompt = `Write a single short paragraph (max 4 sentences) briefing the user for their upcoming meeting. Focus on: open questions or decisions pending from prior emails, recent context with each attendee, and what the user likely wants to walk in knowing. Do NOT invent facts that are not in the context. If context is thin, say so honestly in one sentence.

Context:
${ctxLines.join("\n")}`;
    brief = (await chat(briefPrompt, "You are a calm, factual meeting prep assistant.", { maxTokens: 350 }).catch(() => null))?.trim() ?? null;
  }

  return NextResponse.json({
    ai_available: isAiAvailable(),
    event: {
      id: event.id,
      title: event.title,
      starts_at: event.startsAt,
      ends_at: event.endsAt,
      attendees,
    },
    attendees: perAttendee,
    related_threads: related,
    brief,
    ...(hint ? { hint } : {}),
    model: MODEL,
  });
});
