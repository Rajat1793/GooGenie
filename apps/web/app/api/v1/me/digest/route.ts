/**
 * GET /api/v1/me/digest
 *
 * Feature: daily_digest — "What's on my plate" widget.
 *
 * Aggregates a single-paragraph summary from:
 *   - Reply-needed threads (top 3, ranked by urgency × age)
 *   - Today's calendar agenda (next N events)
 *   - Open AI-extracted tasks (top 5 by priority/deadline)
 *   - Pending feature requests waiting on me (managers only)
 *
 * Returns the structured data + an optional AI-synthesized one-liner.
 */
import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { chat, isAiAvailable, MODEL } from "@googenie/server/integrations/openai";
import { fetchReplyNeededThreads } from "@googenie/server/integrations/gmail";
import { fetchCalendarEvents } from "@googenie/server/integrations/googlecalendar";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { listOpenTasks } from "@googenie/db/tasks";
import { listIncomingRequests } from "@googenie/db/featureRequests";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (req, { auth }) => {
  const gate = await checkFeature(req, "daily_digest");
  if (gate) return gate;

  const me = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  const tenant = getCorsairTenant(auth!.userId);
  const internalId = me?.id ?? auth!.userId;

  // Today's window.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [replyNeededAll, eventsToday, openTasks, incomingReqs] = await Promise.all([
    fetchReplyNeededThreads(tenant, auth!.userId, me?.email ?? null, 10).catch(() => []),
    fetchCalendarEvents(tenant, auth!.userId, {
      timeMin: todayStart.toISOString(),
      timeMax: todayEnd.toISOString(),
      maxResults: 20,
    }).catch(() => []),
    listOpenTasks(internalId, 10).catch(() => []),
    // Only managers see incoming feature requests; ignore errors silently.
    auth!.role === "manager_admin" || auth!.role === "super_admin"
      ? listIncomingRequests(internalId, "pending").catch(() => [])
      : Promise.resolve([]),
  ]);

  const topReplyNeeded = replyNeededAll.slice(0, 3);
  const upcomingMeetings = eventsToday
    .filter((e) => new Date(e.startsAt).getTime() > Date.now())
    .slice(0, 5);
  const topTasks = openTasks.slice(0, 5);
  const pendingRequests = incomingReqs.slice(0, 5);

  // Build a compact natural-language summary via Mistral.
  let summary: string | null = null;
  if (isAiAvailable()) {
    const facts: string[] = [];
    if (topReplyNeeded.length > 0) {
      facts.push(`${topReplyNeeded.length} email${topReplyNeeded.length === 1 ? "" : "s"} waiting on a reply (e.g. "${topReplyNeeded[0].subject}" from ${topReplyNeeded[0].from})`);
    }
    if (upcomingMeetings.length > 0) {
      const nextMeeting = upcomingMeetings[0];
      const hrsAway = Math.max(0, Math.round((new Date(nextMeeting.startsAt).getTime() - Date.now()) / 3600000));
      facts.push(`${upcomingMeetings.length} meeting${upcomingMeetings.length === 1 ? "" : "s"} today, next one "${nextMeeting.title}" in ${hrsAway}h`);
    }
    if (topTasks.length > 0) {
      const highCount = topTasks.filter((t) => t.priority === "high").length;
      facts.push(`${topTasks.length} open task${topTasks.length === 1 ? "" : "s"}${highCount > 0 ? ` (${highCount} high priority)` : ""}`);
    }
    if (pendingRequests.length > 0) {
      facts.push(`${pendingRequests.length} feature request${pendingRequests.length === 1 ? "" : "s"} from your team needing approval`);
    }
    if (facts.length > 0) {
      const prompt = `Write a single warm, encouraging paragraph (2–3 sentences max, no greeting, no signature) summarizing the user's day for an email-and-calendar dashboard. Facts:

${facts.map((f, i) => `${i + 1}. ${f}`).join("\n")}

Tone: concise, friendly, optimistic. Reference the most important item by name. NEVER use placeholders or bullet lists in the output.`;
      summary = (await chat(prompt, "You write concise, warm productivity digests.", { maxTokens: 220 }).catch(() => null))?.trim() ?? null;
    } else {
      summary = "You're all clear — no pending replies, no meetings, no open tasks. Enjoy the calm!";
    }
  }

  return NextResponse.json({
    ai_available: isAiAvailable(),
    generated_at: new Date().toISOString(),
    summary,
    reply_needed: topReplyNeeded,
    upcoming_meetings: upcomingMeetings.map((e) => ({
      id: e.id,
      title: e.title,
      starts_at: e.startsAt,
      ends_at: e.endsAt,
      attendees: e.attendees,
    })),
    tasks: topTasks,
    pending_requests: pendingRequests.map((r) => ({
      id: r.id,
      feature_key: r.featureKey,
      requester_user_id: r.requesterUserId,
      created_at: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })),
    model: MODEL,
  });
});
