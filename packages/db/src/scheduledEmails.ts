/**
 * Data access for `scheduled_emails` — used by the undo-send queue + future
 * "send later" feature. The poller in apps/web/instrumentation.ts picks
 * `queued` rows whose `send_at <= now()` and flushes them via Gmail.
 */
import { eq, and, lt, asc, sql, inArray } from "drizzle-orm";
import { db } from "./client";
import { scheduledEmails } from "./schema";

export interface NewScheduledEmail {
  userId: string;
  tenantId: string;
  to: string;
  subject: string;
  body: string;
  sendAt: Date;
  kind: "undo" | "scheduled";
}

export interface ScheduledEmail {
  id: number;
  userId: string;
  tenantId: string;
  to: string;
  subject: string;
  body: string;
  sendAt: string;
  status: string;
  kind: string;
  createdAt: string;
}

function toRow(r: typeof scheduledEmails.$inferSelect): ScheduledEmail {
  return {
    id: r.id,
    userId: r.userId,
    tenantId: r.tenantId,
    to: r.toAddr,
    subject: r.subject,
    body: r.body,
    sendAt: r.sendAt instanceof Date ? r.sendAt.toISOString() : String(r.sendAt),
    status: r.status,
    kind: r.kind,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  };
}

export async function createScheduledEmail(input: NewScheduledEmail): Promise<ScheduledEmail> {
  const [row] = await db
    .insert(scheduledEmails)
    .values({
      userId: input.userId,
      tenantId: input.tenantId,
      toAddr: input.to,
      subject: input.subject,
      body: input.body,
      sendAt: input.sendAt,
      kind: input.kind,
      status: "queued",
    })
    .returning();
  return toRow(row);
}

export async function listUserScheduledEmails(
  userId: string,
  statuses: string[] = ["queued"],
): Promise<ScheduledEmail[]> {
  const rows = await db
    .select()
    .from(scheduledEmails)
    .where(
      and(
        eq(scheduledEmails.userId, userId),
        inArray(scheduledEmails.status, statuses),
      ),
    )
    .orderBy(asc(scheduledEmails.sendAt));
  return rows.map(toRow);
}

export async function getScheduledEmail(id: number, userId: string): Promise<ScheduledEmail | null> {
  const [row] = await db
    .select()
    .from(scheduledEmails)
    .where(and(eq(scheduledEmails.id, id), eq(scheduledEmails.userId, userId)))
    .limit(1);
  return row ? toRow(row) : null;
}

/** Cancel a queued email. Returns true if it was actually cancelled (still queued). */
export async function cancelScheduledEmail(id: number, userId: string): Promise<boolean> {
  const res = await db
    .update(scheduledEmails)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(scheduledEmails.id, id),
        eq(scheduledEmails.userId, userId),
        eq(scheduledEmails.status, "queued"),
      ),
    )
    .returning({ id: scheduledEmails.id });
  return res.length > 0;
}

/**
 * Atomically claim rows that are due (status=queued AND send_at<=now).
 * Uses SELECT … FOR UPDATE SKIP LOCKED so two pollers don't double-send.
 */
export async function claimDueScheduledEmails(limit = 20): Promise<ScheduledEmail[]> {
  const rows = await db.transaction(async (tx) => {
    const claimed = await tx.execute(sql`
      SELECT * FROM scheduled_emails
       WHERE status = 'queued' AND send_at <= NOW()
       ORDER BY send_at ASC
       LIMIT ${limit}
       FOR UPDATE SKIP LOCKED
    `);
    const ids = (claimed as unknown as { rows: Array<{ id: string | number }> }).rows.map((r) =>
      Number(r.id),
    );
    if (ids.length === 0) return [];
    await tx.execute(sql`
      UPDATE scheduled_emails
         SET status = 'sending', updated_at = NOW()
       WHERE id = ANY(${ids})
    `);
    const updated = await tx
      .select()
      .from(scheduledEmails)
      .where(sql`${scheduledEmails.id} = ANY(${ids})`);
    return updated;
  });
  return rows.map(toRow);
}

export async function markScheduledEmailSent(
  id: number,
  sentMessageId: string | undefined,
): Promise<void> {
  await db
    .update(scheduledEmails)
    .set({ status: "sent", sentMessageId: sentMessageId ?? null, updatedAt: new Date() })
    .where(eq(scheduledEmails.id, id));
}

export async function markScheduledEmailFailed(id: number, error: string): Promise<void> {
  await db
    .update(scheduledEmails)
    .set({ status: "failed", error, updatedAt: new Date() })
    .where(eq(scheduledEmails.id, id));
}

/** Cheap GC for old completed rows (called occasionally from the poller). */
export async function gcScheduledEmails(): Promise<number> {
  const res = await db
    .delete(scheduledEmails)
    .where(
      and(
        sql`${scheduledEmails.status} IN ('sent', 'cancelled', 'failed')`,
        lt(scheduledEmails.updatedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
      ),
    )
    .returning({ id: scheduledEmails.id });
  return res.length;
}
