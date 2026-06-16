/**
 * POST /api/v1/email/messages/schedule
 *
 * Queue an email for later send (default 10s — Superhuman-style undo window).
 * The poller in instrumentation.ts picks it up and flushes via gmail.sendEmail
 * once `send_at` passes.
 *
 * Body: { to, subject, body, delay_seconds?, send_at? }
 *   - `delay_seconds`: 0..3600, used for the undo-send queue (default 10)
 *   - `send_at`: ISO timestamp; takes precedence over delay_seconds if set
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { createScheduledEmail } from "@googenie/db/scheduledEmails";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { checkFeature } from "../../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scheduleSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(100_000),
  delay_seconds: z.number().int().min(0).max(3600).optional(),
  send_at: z.string().datetime().optional(),
});

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "email_write");
  if (gate) return gate;
  const parsed = await validateBody(scheduleSchema, req, {
    traceId,
    message: "Invalid schedule payload",
  });
  if (!parsed.ok) return parsed.response;
  const { to, subject, body, delay_seconds, send_at } = parsed.data;

  const me = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  if (!me) {
    return NextResponse.json({ error: "User not provisioned in DB yet" }, { status: 400 });
  }

  const sendAt = send_at
    ? new Date(send_at)
    : new Date(Date.now() + (delay_seconds ?? 10) * 1000);
  const kind: "undo" | "scheduled" =
    !send_at && (delay_seconds === undefined || delay_seconds <= 30) ? "undo" : "scheduled";

  const row = await createScheduledEmail({
    userId: me.id,
    // Corsair tenant uses the Clerk/auth id, not the internal user.id.
    tenantId: getCorsairTenant(auth!.userId),
    to,
    subject,
    body,
    sendAt,
    kind,
  });
  return NextResponse.json(row, { status: 201 });
});
