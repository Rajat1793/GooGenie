/**
 * Follow-up tracker (Feature B4) — polls sent emails to check if recipients replied.
 *
 * Schema: `sent_emails` table with (id, user_id, tenant_id, thread_id, to, subject, sent_at, follow_up_at, status).
 * Poller runs every 60s, checks if each pending email got a reply via Corsair's local DB.
 */
import { fetchReplyNeededThreads } from "./gmail";

export interface SentEmailRecord {
  id: number;
  userId: string;
  tenantId: string;
  threadId: string;
  to: string;
  subject: string;
  sentAt: string;
  followUpAt: string;
  status: "pending" | "replied" | "expired";
}

// In-memory store for MVP — production would use postgres.
const store = new Map<number, SentEmailRecord>();
let nextId = 1;

export function trackSentEmail(opts: {
  userId: string;
  tenantId: string;
  threadId: string;
  to: string;
  subject: string;
  followUpDays?: number;
}): number {
  const now = new Date();
  const followUpAt = new Date(now.getTime() + (opts.followUpDays ?? 3) * 24 * 3600 * 1000);
  const id = nextId++;
  store.set(id, {
    id,
    userId: opts.userId,
    tenantId: opts.tenantId,
    threadId: opts.threadId,
    to: opts.to,
    subject: opts.subject,
    sentAt: now.toISOString(),
    followUpAt: followUpAt.toISOString(),
    status: "pending",
  });
  return id;
}

export async function checkFollowUps(tenantId: string, userId: string, userEmail: string | null): Promise<SentEmailRecord[]> {
  const now = Date.now();
  const pending: SentEmailRecord[] = [];
  for (const rec of store.values()) {
    if (rec.userId !== userId || rec.tenantId !== tenantId) continue;
    if (rec.status !== "pending") continue;
    if (new Date(rec.followUpAt).getTime() > now) continue;

    // Check if they replied via the reply-needed query (inverse logic: if thread NOT in reply-needed, they replied).
    const neededList = await fetchReplyNeededThreads(tenantId, userId, userEmail, 50);
    const stillWaiting = neededList.some((t) => t.threadId === rec.threadId);
    if (!stillWaiting) {
      rec.status = "replied";
    } else {
      // Still waiting → surface for follow-up.
      pending.push(rec);
      // Mark expired if > 7 days old.
      if (new Date(rec.sentAt).getTime() < now - 7 * 24 * 3600 * 1000) {
        rec.status = "expired";
      }
    }
  }
  return pending.filter((r) => r.status === "pending");
}

export function listAllFollowUps(userId: string): SentEmailRecord[] {
  return Array.from(store.values()).filter((r) => r.userId === userId);
}
