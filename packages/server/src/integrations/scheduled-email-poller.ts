/**
 * Background poller that flushes the `scheduled_emails` queue.
 *
 * Tick = 3s — small enough that a 10s undo-send window feels immediate, large
 * enough to keep DB load negligible. Each tick:
 *   1. claimDueScheduledEmails() atomically grabs rows where status='queued'
 *      AND send_at <= NOW(), marking them 'sending' under FOR UPDATE SKIP
 *      LOCKED so multiple processes can run safely.
 *   2. For each row → call gmail.sendEmail() → mark sent / failed.
 *   3. Every ~50 ticks, run gcScheduledEmails() to prune completed rows.
 *
 * In dev, Next.js HMR can call `register()` twice; the singleton flag below
 * keeps us from stacking timers.
 */
import {
  claimDueScheduledEmails,
  markScheduledEmailSent,
  markScheduledEmailFailed,
  gcScheduledEmails,
} from "@googenie/db/scheduledEmails";
import { sendEmail } from "./gmail";
import { publish } from "./event-bus";

const TICK_MS = 3000;
const GC_EVERY_TICKS = 50;

let started = false;
let tickCount = 0;

export function startScheduledEmailPoller(): void {
  if (started) return;
  started = true;

  const tick = async () => {
    try {
      const due = await claimDueScheduledEmails(20);
      if (due.length > 0) {
        console.log(`[scheduled-email] tick: claimed ${due.length} due rows`);
      }
      for (const row of due) {
        try {
          const result = await sendEmail(row.tenantId, {
            to: row.to,
            subject: row.subject,
            body: row.body,
          });
          await markScheduledEmailSent(row.id, result.id);
          // SSE so the sender's UI updates (their Sent folder etc.)
          publish({
            kind: "email.changed",
            userId: row.userId,
            ...(result.threadId ? { threadId: result.threadId } : {}),
          });
          console.log(
            `[scheduled-email] sent id=${row.id} to=${row.to} kind=${row.kind}`,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await markScheduledEmailFailed(row.id, message);
          console.warn(`[scheduled-email] failed id=${row.id}:`, message);
        }
      }
      tickCount += 1;
      if (tickCount % GC_EVERY_TICKS === 0) {
        const purged = await gcScheduledEmails();
        if (purged > 0) console.log(`[scheduled-email] GC purged ${purged} old rows`);
      }
    } catch (err) {
      console.warn("[scheduled-email] tick error:", (err as Error).message);
    }
  };

  // Kick an initial tick immediately so any rows whose send_at is already
  // past (e.g. queued before the last server restart) are flushed without
  // waiting a full TICK_MS. Subsequent ticks happen on the regular cadence.
  void tick();

  const handle = setInterval(() => void tick(), TICK_MS);
  // Allow Node to exit even if this timer is pending (dev / tests).
  if (typeof handle.unref === "function") handle.unref();
  console.log(`[scheduled-email] poller started (tick=${TICK_MS}ms, immediate-flush=true)`);
}
