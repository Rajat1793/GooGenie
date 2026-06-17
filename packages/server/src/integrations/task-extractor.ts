/**
 * Email-to-task extractor (Feature C1).
 *
 * Sweeps recent inbox messages via Corsair's local cache and asks Mistral to
 * extract action items from each. Writes deduped rows into the `tasks` table.
 *
 * Triggered:
 *   - On-demand: POST /api/v1/me/tasks/extract
 *   - Scheduled: optional daily cron (future)
 *
 * Why Corsair-heavy: bodies are already cached locally; the daily scan is a
 * single SELECT, not hundreds of Gmail GETs.
 */
import { fetchRecentUnreadInbox, type UnreadInboxMessage } from "./gmail";
import { chat, isAiAvailable } from "./openai";
import { createTask, listProcessedThreadIds, type Task } from "@googenie/db/tasks";

interface ExtractedItem {
  title: string;
  deadline: string | null; // ISO-8601 or null
  priority: "low" | "normal" | "high";
}

const VALID_PRIORITIES = new Set(["low", "normal", "high"]);

/** Deterministic fallback when AI is unavailable. */
function fallbackExtract(msg: UnreadInboxMessage): ExtractedItem[] {
  const blob = `${msg.subject} ${msg.snippet}`;
  // Simple heuristic: only extract if the message looks task-y.
  if (!/please|need|action|todo|deadline|by\s+(monday|tuesday|wednesday|thursday|friday|tomorrow|\d)|review|approve|send|complete/i.test(blob)) {
    return [];
  }
  // Detect priority from urgency keywords.
  let priority: "low" | "normal" | "high" = "normal";
  if (/asap|urgent|immediately|today|critical/i.test(blob)) priority = "high";
  else if (/whenever|no rush|low priority/i.test(blob)) priority = "low";

  // Crude deadline parse — extract "by Friday" / "by Sep 12" / "tomorrow".
  let deadline: string | null = null;
  const tomorrowMatch = /\btomorrow\b/i.test(blob);
  const dayMatch = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(blob);
  if (tomorrowMatch) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(17, 0, 0, 0);
    deadline = d.toISOString();
  } else if (dayMatch) {
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const target = dayNames.indexOf(dayMatch[1].toLowerCase());
    if (target >= 0) {
      const d = new Date();
      const cur = d.getDay();
      const offset = ((target - cur + 7) % 7) || 7;
      d.setDate(d.getDate() + offset);
      d.setHours(17, 0, 0, 0);
      deadline = d.toISOString();
    }
  }
  return [
    {
      title: msg.subject.slice(0, 200),
      deadline,
      priority,
    },
  ];
}

async function extractFromMessage(msg: UnreadInboxMessage): Promise<ExtractedItem[]> {
  if (!isAiAvailable()) return fallbackExtract(msg);
  const prompt = `Extract concrete action items from this email. ONLY include things the recipient (the user) needs to do. Skip greetings, FYIs, and information-only messages.

From: ${msg.from}
Subject: ${msg.subject}
Body: ${msg.snippet}

Respond with STRICT JSON:
{ "tasks": [
    { "title": "<short imperative phrase, max 80 chars>",
      "deadline": "<ISO-8601 datetime or null>",
      "priority": "low" | "normal" | "high" }
  ]
}

Rules:
- If no action items, return { "tasks": [] }
- Title MUST be imperative ("Review Q4 deck", "Approve budget").
- Deadline ONLY if explicitly stated ("by Friday", "before EOD"). Convert relative dates to ISO assuming today is ${new Date().toISOString().slice(0, 10)}.
- Priority high if "ASAP/urgent/today/critical", low if "whenever/no rush", else normal.`;
  const raw = await chat(prompt, "You return ONLY a single JSON object.", { jsonMode: true, maxTokens: 400 }).catch(() => null);
  if (!raw) return fallbackExtract(msg);
  try {
    const parsed = JSON.parse(raw) as { tasks?: Array<Partial<ExtractedItem>> };
    if (!Array.isArray(parsed.tasks)) return [];
    const out: ExtractedItem[] = [];
    for (const t of parsed.tasks) {
      if (!t.title || typeof t.title !== "string") continue;
      const priority = VALID_PRIORITIES.has(t.priority ?? "")
        ? (t.priority as "low" | "normal" | "high")
        : "normal";
      let deadline: string | null = null;
      if (typeof t.deadline === "string" && t.deadline.length > 0) {
        const parsedDate = new Date(t.deadline);
        if (!Number.isNaN(parsedDate.getTime())) deadline = parsedDate.toISOString();
      }
      out.push({ title: t.title.slice(0, 200), deadline, priority });
    }
    return out;
  } catch {
    return [];
  }
}

export interface ExtractTasksResult {
  scanned: number;
  created: number;
  skipped: number;
  tasks: Task[];
}

export async function runTaskExtraction(opts: {
  tenantId: string;
  userId: string;
  limit?: number;
}): Promise<ExtractTasksResult> {
  const { tenantId, userId, limit = 15 } = opts;
  const msgs = await fetchRecentUnreadInbox(tenantId, limit);
  if (msgs.length === 0) {
    return { scanned: 0, created: 0, skipped: 0, tasks: [] };
  }

  // Skip threads we've already extracted tasks for.
  const threadIds = msgs.map((m) => m.threadId);
  const processed = await listProcessedThreadIds(userId, threadIds);
  const fresh = msgs.filter((m) => !processed.has(m.threadId));
  const skipped = msgs.length - fresh.length;

  const created: Task[] = [];
  for (const msg of fresh) {
    const items = await extractFromMessage(msg);
    for (const item of items) {
      const senderEmail = (/<([^>]+)>/.exec(msg.from) ?? [null, msg.from])[1] ?? null;
      try {
        const task = await createTask({
          userId,
          tenantId,
          threadId: msg.threadId,
          title: item.title,
          senderEmail,
          deadline: item.deadline ? new Date(item.deadline) : null,
          priority: item.priority,
          snippet: msg.snippet.slice(0, 280),
        });
        created.push(task);
      } catch {
        /* keep going */
      }
    }
  }

  return {
    scanned: msgs.length,
    created: created.length,
    skipped,
    tasks: created,
  };
}
