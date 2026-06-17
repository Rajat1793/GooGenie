/**
 * POST /api/v1/ai/threads/[threadId]/schedule-from-email
 *
 * Companion to /extract-meeting. Body:
 *   { start: ISO, end: ISO, title?: string, reply_body?: string }
 *
 * Performs the two Corsair-backed mutations in one atomic-feeling flow:
 *   1. createGCalEvent with the email's sender as attendee
 *   2. replyToThread acknowledging the chosen time
 *
 * Returns { event, reply } so the UI can show a single success toast that
 * links to both the new event and the sent reply.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { createGCalEvent } from "@googenie/server/integrations/googlecalendar";
import {
  fetchGmailThread,
  replyToThread,
} from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { paramString } from "../../../../_lib/params";
import { checkFeature } from "../../../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  title: z.string().min(1).max(200).optional(),
  reply_body: z.string().min(1).max(8000).optional(),
  with_meet: z.boolean().optional(),
});

function extractSenderEmail(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim();
}

export const POST = withApiMiddleware(async (req, { auth, traceId, params }) => {
  // Calendar create + email reply both need write scopes.
  const gateCal = await checkFeature(req, "calendar_create");
  if (gateCal) return gateCal;
  const gateMail = await checkFeature(req, "email_write");
  if (gateMail) return gateMail;

  const threadId = paramString(params.threadId);
  if (!threadId) {
    return NextResponse.json({ error: "Missing threadId" }, { status: 400 });
  }
  const parsed = await validateBody(bodySchema, req, {
    traceId,
    message: "Invalid schedule-from-email payload",
  });
  if (!parsed.ok) return parsed.response;

  const tenant = getCorsairTenant(auth!.userId);
  const thread = await fetchGmailThread(tenant, threadId, auth!.userId).catch(() => undefined);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const senderEmail = extractSenderEmail(thread.from);
  const eventTitle = parsed.data.title?.trim() || thread.subject;
  const eventDescription = `Scheduled from email thread "${thread.subject}".`;

  let event;
  try {
    event = await createGCalEvent({
      tenantId: tenant,
      ownerUserId: auth!.userId,
      title: eventTitle,
      startsAt: parsed.data.start,
      endsAt: parsed.data.end,
      attendees: senderEmail ? [senderEmail] : [],
      description: eventDescription,
      withMeet: parsed.data.with_meet ?? true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create calendar event" },
      { status: 500 },
    );
  }

  let reply: { id?: string; threadId?: string } | undefined;
  if (parsed.data.reply_body && senderEmail) {
    try {
      reply = await replyToThread(tenant, {
        threadId,
        to: senderEmail,
        subject: thread.subject,
        body: parsed.data.reply_body,
      });
    } catch (err) {
      // Event already created — surface the error but still return event.
      return NextResponse.json(
        {
          event,
          reply: null,
          warning: err instanceof Error ? err.message : "Reply send failed",
        },
        { status: 207 },
      );
    }
  }

  return NextResponse.json({ event, reply: reply ?? null });
});
