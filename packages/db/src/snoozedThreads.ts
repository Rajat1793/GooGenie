/**
 * Data access for `snoozed_threads` — Superhuman-style snooze.
 *
 * The inbox list endpoint calls `listActiveSnoozedIds(userId)` to filter out
 * still-snoozed threads. Awakening is lazy: any row whose `wake_at` has
 * passed is bumped to status='awake' inside that same call (single round-trip
 * UPDATE … RETURNING) so the user sees the thread again on their next refresh.
 */
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "./client";
import { snoozedThreads } from "./schema";

export interface SnoozedThread {
  id: number;
  userId: string;
  tenantId: string;
  threadId: string;
  wakeAt: string;
  status: string;
  createdAt: string;
}

function toRow(r: typeof snoozedThreads.$inferSelect): SnoozedThread {
  return {
    id: r.id,
    userId: r.userId,
    tenantId: r.tenantId,
    threadId: r.threadId,
    wakeAt: r.wakeAt instanceof Date ? r.wakeAt.toISOString() : String(r.wakeAt),
    status: r.status,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  };
}

export async function snoozeThread(input: {
  userId: string;
  tenantId: string;
  threadId: string;
  wakeAt: Date;
}): Promise<SnoozedThread> {
  // Upsert — if the user re-snoozes a thread we just bump wake_at and reset
  // status to 'snoozed'.
  const [row] = await db
    .insert(snoozedThreads)
    .values({
      userId: input.userId,
      tenantId: input.tenantId,
      threadId: input.threadId,
      wakeAt: input.wakeAt,
      status: "snoozed",
    })
    .onConflictDoUpdate({
      target: [snoozedThreads.userId, snoozedThreads.threadId],
      set: {
        wakeAt: input.wakeAt,
        status: "snoozed",
        updatedAt: new Date(),
      },
    })
    .returning();
  return toRow(row);
}

/** Cancel a snooze (user clicked "Unsnooze"). */
export async function unsnoozeThread(userId: string, threadId: string): Promise<boolean> {
  const res = await db
    .update(snoozedThreads)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(snoozedThreads.userId, userId),
        eq(snoozedThreads.threadId, threadId),
        eq(snoozedThreads.status, "snoozed"),
      ),
    )
    .returning({ id: snoozedThreads.id });
  return res.length > 0;
}

/**
 * Atomically awaken any rows whose wake_at has passed, then return the set of
 * thread_ids that are still snoozed. Inbox endpoint uses this to filter the
 * Gmail list.
 */
export async function listActiveSnoozedIds(userId: string): Promise<{
  active: string[];
  awakened: string[];
}> {
  // (1) Awaken anything whose wake_at <= NOW()
  const awakened = await db
    .update(snoozedThreads)
    .set({ status: "awake", updatedAt: new Date() })
    .where(
      and(
        eq(snoozedThreads.userId, userId),
        eq(snoozedThreads.status, "snoozed"),
        sql`${snoozedThreads.wakeAt} <= NOW()`,
      ),
    )
    .returning({ threadId: snoozedThreads.threadId });

  // (2) Return remaining still-snoozed IDs.
  const stillSnoozed = await db
    .select({ threadId: snoozedThreads.threadId })
    .from(snoozedThreads)
    .where(
      and(
        eq(snoozedThreads.userId, userId),
        eq(snoozedThreads.status, "snoozed"),
        gt(snoozedThreads.wakeAt, new Date()),
      ),
    );

  return {
    active: stillSnoozed.map((r) => r.threadId),
    awakened: awakened.map((r) => r.threadId),
  };
}

/** List with full row data (used by /me/snoozed for a "Snoozed" view). */
export async function listUserSnoozedThreads(userId: string): Promise<SnoozedThread[]> {
  const rows = await db
    .select()
    .from(snoozedThreads)
    .where(and(eq(snoozedThreads.userId, userId), eq(snoozedThreads.status, "snoozed")))
    .orderBy(snoozedThreads.wakeAt);
  return rows.map(toRow);
}
