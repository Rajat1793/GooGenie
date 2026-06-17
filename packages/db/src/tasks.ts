/**
 * Data access for `tasks` (Feature C1 — Email-to-task extractor).
 *
 * Daily cron / on-demand sweep extracts action items from recent emails via
 * Mistral and writes rows here. Open tasks surface in the "what's on my plate"
 * widget.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./client";
import { tasks } from "./schema";

export interface NewTask {
  userId: string;
  tenantId: string;
  threadId: string;
  title: string;
  senderEmail?: string | null;
  deadline?: Date | null;
  priority?: "low" | "normal" | "high";
  snippet?: string | null;
}

export interface Task {
  id: number;
  userId: string;
  tenantId: string;
  threadId: string;
  title: string;
  senderEmail: string | null;
  deadline: string | null;
  priority: string;
  status: string;
  snippet: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToTask(row: typeof tasks.$inferSelect): Task {
  return {
    id: row.id,
    userId: row.userId,
    tenantId: row.tenantId,
    threadId: row.threadId,
    title: row.title,
    senderEmail: row.senderEmail,
    deadline: row.deadline ? new Date(row.deadline as unknown as string).toISOString() : null,
    priority: row.priority,
    status: row.status,
    snippet: row.snippet,
    createdAt: new Date(row.createdAt as unknown as string).toISOString(),
    updatedAt: new Date(row.updatedAt as unknown as string).toISOString(),
  };
}

/**
 * Insert a new task. Idempotent on (user_id, thread_id, title) — if a task
 * with the same title already exists for the thread, returns the existing row.
 */
export async function createTask(t: NewTask): Promise<Task> {
  // Check for existing same-thread task with same title to avoid duplicates.
  const existing = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, t.userId),
        eq(tasks.threadId, t.threadId),
        eq(tasks.title, t.title),
      ),
    )
    .limit(1);
  if (existing[0]) return rowToTask(existing[0]);

  const [inserted] = await db
    .insert(tasks)
    .values({
      userId: t.userId,
      tenantId: t.tenantId,
      threadId: t.threadId,
      title: t.title,
      senderEmail: t.senderEmail ?? null,
      deadline: t.deadline ?? null,
      priority: t.priority ?? "normal",
      snippet: t.snippet ?? null,
    })
    .returning();
  return rowToTask(inserted);
}

export async function listOpenTasks(userId: string, limit = 50): Promise<Task[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.status, "open")))
    .orderBy(
      // High priority first, then nearest deadline (nulls last), then newest.
      sql`CASE ${tasks.priority} WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END ASC`,
      sql`${tasks.deadline} ASC NULLS LAST`,
      desc(tasks.createdAt),
    )
    .limit(limit);
  return rows.map(rowToTask);
}

export async function updateTaskStatus(
  userId: string,
  taskId: number,
  status: "open" | "done" | "dismissed",
): Promise<Task | null> {
  const [updated] = await db
    .update(tasks)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();
  return updated ? rowToTask(updated) : null;
}

export async function deleteTaskById(userId: string, taskId: number): Promise<boolean> {
  const res = await db
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning({ id: tasks.id });
  return res.length > 0;
}

/**
 * Returns thread IDs that already have at least one task — used by the
 * extractor to skip re-processing the same thread on every sweep.
 */
export async function listProcessedThreadIds(userId: string, threadIds: string[]): Promise<Set<string>> {
  if (threadIds.length === 0) return new Set();
  const rows = await db
    .select({ threadId: tasks.threadId })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        sql`${tasks.threadId} = ANY(${threadIds})`,
      ),
    );
  return new Set(rows.map((r) => r.threadId));
}
