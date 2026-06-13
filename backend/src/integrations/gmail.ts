/**
 * Gmail integration wrapper — normalizes Corsair Gmail API responses.
 * Fetches real subjects/from/unread status. Uses TTL cache to minimize API calls.
 */
import { corsair, isCorsairConfigured } from "./corsair.js";
import { listEmailThreads, getEmailThreadById } from "../domain/email-store.js";
import type { EmailThread } from "../domain/email-store.js";
import { cache, TTL } from "../security/cache.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getHeader(headers: Array<{ name?: string; value?: string }>, name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function buildRawMessage(opts: {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`] : []),
    ...(opts.references  ? [`References: ${opts.references}`]  : []),
    "",
    opts.body
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

// ── fetchGmailThreads ─────────────────────────────────────────────────────────

export async function fetchGmailThreads(
  tenantId: string,
  userId: string,
  maxResults = 10
): Promise<EmailThread[]> {
  if (!isCorsairConfigured()) {
    return listEmailThreads(tenantId, new Set([userId]));
  }

  const cacheKey = `threads:${tenantId}:${userId}:${maxResults}`;
  const cached = cache.get<EmailThread[]>(cacheKey);
  if (cached) return cached;

  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tenant as any;

    // Step 1: list thread IDs (fast)
    const listResult = await t.gmail.api.threads.list({ maxResults, labelIds: ["INBOX"] });
    const rawThreads: Array<{ id?: string }> = listResult?.threads ?? [];

    // Step 2: fetch each thread in parallel to get real headers
    const threads = await Promise.all(
      rawThreads.map(async (raw) => {
        const id = raw.id ?? crypto.randomUUID();

        // Check per-thread cache first
        const threadKey = `thread:${tenantId}:${id}`;
        const cachedThread = cache.get<EmailThread>(threadKey);
        if (cachedThread) return cachedThread;

        try {
          const full = await t.gmail.api.threads.get({ id });
          const messages: Array<{
            payload?: { headers?: Array<{ name?: string; value?: string }> };
            labelIds?: string[];
            snippet?: string;
            internalDate?: string;
          }> = full?.messages ?? [];

          const firstMsg = messages[0];
          const headers = firstMsg?.payload?.headers ?? [];
          const allLabelIds: string[] = messages.flatMap((m) => m.labelIds ?? []);
          const isUnread = allLabelIds.includes("UNREAD");

          const thread: EmailThread = {
            id,
            tenantId,
            ownerUserId: userId,
            subject: getHeader(headers, "subject") || `(no subject)`,
            snippet: full?.snippet ?? firstMsg?.snippet ?? "",
            from: getHeader(headers, "from") || "unknown",
            updatedAt: firstMsg?.internalDate
              ? new Date(Number(firstMsg.internalDate)).toISOString()
              : new Date().toISOString(),
            isUnread,
            labelIds: [...new Set(allLabelIds)],
          };

          cache.set(threadKey, thread, TTL.THREAD);
          return thread;
        } catch {
          // Fallback for this specific thread
          return {
            id,
            tenantId,
            ownerUserId: userId,
            subject: "(no subject)",
            snippet: "",
            from: "unknown",
            updatedAt: new Date().toISOString(),
            isUnread: false,
            labelIds: ["INBOX"],
          } satisfies EmailThread;
        }
      })
    );

    cache.set(cacheKey, threads, TTL.THREADS);
    return threads;
  } catch {
    return listEmailThreads(tenantId, new Set([userId]));
  }
}

// ── fetchGmailThread ──────────────────────────────────────────────────────────

export async function fetchGmailThread(
  tenantId: string,
  threadId: string,
  userId: string,
  scopedIds?: Set<string>
): Promise<EmailThread | undefined> {
  if (!isCorsairConfigured()) {
    return getEmailThreadById(tenantId, threadId, scopedIds ?? new Set([userId]));
  }

  const cacheKey = `thread:${tenantId}:${threadId}`;
  const cached = cache.get<EmailThread>(cacheKey);
  if (cached) return cached;

  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (tenant as any).gmail.api.threads.get({ id: threadId });
    if (!result) return undefined;

    const messages: Array<{
      payload?: { headers?: Array<{ name?: string; value?: string }>; body?: { data?: string }; parts?: Array<{ mimeType?: string; body?: { data?: string } }> };
      labelIds?: string[];
      snippet?: string;
      internalDate?: string;
    }> = result.messages ?? [];

    const firstMsg = messages[0];
    const headers = firstMsg?.payload?.headers ?? [];
    const allLabelIds: string[] = messages.flatMap((m) => m.labelIds ?? []);

    // Extract plaintext body
    function decodeBody(data?: string): string {
      if (!data) return "";
      try { return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"); } catch { return ""; }
    }
    function extractBody(msg: typeof firstMsg): string {
      if (!msg?.payload) return "";
      if (msg.payload.body?.data) return decodeBody(msg.payload.body.data);
      const textPart = msg.payload.parts?.find((p) => p.mimeType === "text/plain");
      return textPart?.body?.data ? decodeBody(textPart.body.data) : (msg.snippet ?? "");
    }

    const thread: EmailThread = {
      id: result.id ?? threadId,
      tenantId,
      ownerUserId: userId,
      subject: getHeader(headers, "subject") || "(no subject)",
      snippet: extractBody(firstMsg),
      from: getHeader(headers, "from") || "unknown",
      updatedAt: firstMsg?.internalDate
        ? new Date(Number(firstMsg.internalDate)).toISOString()
        : new Date().toISOString(),
      isUnread: allLabelIds.includes("UNREAD"),
      labelIds: [...new Set(allLabelIds)],
    };

    cache.set(cacheKey, thread, TTL.THREAD);
    return thread;
  } catch {
    return getEmailThreadById(tenantId, threadId, scopedIds ?? new Set([userId]));
  }
}

// ── sendEmail ─────────────────────────────────────────────────────────────────

export async function sendEmail(
  tenantId: string,
  opts: { to: string; subject: string; body: string }
): Promise<{ id?: string; threadId?: string }> {
  const raw = buildRawMessage(opts);
  const tenant = corsair.withTenant(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (tenant as any).gmail.api.messages.send({ raw });
  // Invalidate thread list cache after send
  cache.invalidatePrefix(`threads:${tenantId}`);
  return result;
}

// ── replyToThread ─────────────────────────────────────────────────────────────

export async function replyToThread(
  tenantId: string,
  opts: { threadId: string; to: string; subject: string; body: string; messageId?: string }
): Promise<{ id?: string; threadId?: string }> {
  const raw = buildRawMessage({
    to: opts.to,
    subject: opts.subject.startsWith("Re:") ? opts.subject : `Re: ${opts.subject}`,
    body: opts.body,
    inReplyTo: opts.messageId,
    references: opts.messageId
  });
  const tenant = corsair.withTenant(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (tenant as any).gmail.api.messages.send({ raw, threadId: opts.threadId });
  // Invalidate caches for this thread + list
  cache.invalidatePrefix(`threads:${tenantId}`);
  cache.delete(`thread:${tenantId}:${opts.threadId}`);
  return result;
}

// ── modifyThreadLabels ────────────────────────────────────────────────────────

export async function modifyThreadLabels(
  tenantId: string,
  threadId: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<{ id?: string }> {
  const tenant = corsair.withTenant(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (tenant as any).gmail.api.threads.modify({ id: threadId, addLabelIds, removeLabelIds });
  // Invalidate caches so next load reflects new labels
  cache.invalidatePrefix(`threads:${tenantId}`);
  cache.delete(`thread:${tenantId}:${threadId}`);
  return result;
}
