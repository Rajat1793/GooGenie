/**
 * Gmail integration — full Corsair Gmail API surface.
 * Uses DB search (gmail.db.messages.search) for near-zero latency search.
 * Falls back to API calls only when needed. TTL cache prevents redundant fetches.
 */
import { corsair, isCorsairConfigured } from "./corsair.js";
import { listEmailThreads, getEmailThreadById } from "../domain/email-store.js";
import type { EmailThread } from "../domain/email-store.js";
import { cache, TTL } from "../security/cache.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getHeader(headers: Array<{ name?: string; value?: string }>, name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export function buildRawMessage(opts: {
  to: string; subject: string; body: string;
  from?: string; inReplyTo?: string; references?: string;
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

function decodeBody(data?: string): string {
  if (!data) return "";
  try { return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"); } catch { return ""; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBodyFromMsg(msg: any): { text: string; html?: string } {
  if (!msg?.payload) return { text: msg?.snippet ?? "" };
  // Single-part body (rare, usually short notifications)
  if (msg.payload.body?.data) {
    const decoded = decodeBody(msg.payload.body.data);
    if (msg.payload.mimeType === "text/html") return { text: stripHtml(decoded), html: decoded };
    return { text: decoded };
  }
  // Recursively walk parts for both text/plain and text/html
  const parts: any[] = [];
  function walk(p: any) {
    if (!p) return;
    if (p.parts) p.parts.forEach(walk);
    else parts.push(p);
  }
  walk(msg.payload);
  const textPart = parts.find((p) => p.mimeType === "text/plain" && p.body?.data);
  const htmlPart = parts.find((p) => p.mimeType === "text/html" && p.body?.data);
  const text = textPart ? decodeBody(textPart.body.data) : (htmlPart ? stripHtml(decodeBody(htmlPart.body.data)) : (msg.snippet ?? ""));
  const html = htmlPart ? decodeBody(htmlPart.body.data) : undefined;
  return { text, html };
}

function stripHtml(s: string): string {
  return s.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeThread(raw: any, tenantId: string, userId: string): EmailThread {
  const messages = raw?.messages ?? [];
  const firstMsg = messages[0];
  const headers = firstMsg?.payload?.headers ?? [];
  const allLabelIds: string[] = messages.flatMap((m: any) => m.labelIds ?? []);
  const body = extractBodyFromMsg(firstMsg);
  return {
    id: raw.id,
    tenantId,
    ownerUserId: userId,
    subject: getHeader(headers, "subject") || "(no subject)",
    snippet: body.text,
    bodyHtml: body.html,
    from: getHeader(headers, "from") || "unknown",
    updatedAt: firstMsg?.internalDate
      ? new Date(Number(firstMsg.internalDate)).toISOString()
      : new Date().toISOString(),
    isUnread: allLabelIds.includes("UNREAD"),
    labelIds: [...new Set(allLabelIds)],
  };
}

// ── fetchGmailThreads — uses DB search for speed ──────────────────────────────

export async function fetchGmailThreads(
  tenantId: string,
  userId: string,
  maxResults = 10,
  searchQuery?: string
): Promise<EmailThread[]> {
  if (!isCorsairConfigured()) return listEmailThreads(tenantId, new Set([userId]));

  const cacheKey = `threads:${tenantId}:${userId}:${maxResults}:${searchQuery ?? ""}`;
  const cached = cache.get<EmailThread[]>(cacheKey);
  if (cached) return cached;

  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tenant as any;

    // Use DB search if query or if listing (faster than API)
    if (searchQuery) {
      // DB search: near-zero latency, uses Corsair's local sync
      try {
        const dbResults = await t.gmail.db.messages.search({
          data: {
            OR: [
              { subject: { contains: searchQuery } },
              { from: { contains: searchQuery } },
              { body: { contains: searchQuery } },
            ],
          },
          limit: maxResults,
        });

        if (dbResults?.length > 0) {
          // Get unique thread IDs from message results
          const threadIds = [...new Set<string>(dbResults.map((m: any) => m.threadId).filter(Boolean))];
          const threads = await Promise.all(
            threadIds.slice(0, maxResults).map(async (id: string) => {
              const tk = `thread:${tenantId}:${id}`;
              const ct = cache.get<EmailThread>(tk);
              if (ct) return ct;
              const full = await t.gmail.api.threads.get({ id }).catch(() => null);
              if (!full) return null;
              const thread = normalizeThread(full, tenantId, userId);
              cache.set(tk, thread, TTL.THREAD);
              return thread;
            })
          );
          const result = threads.filter(Boolean) as EmailThread[];
          cache.set(cacheKey, result, TTL.THREADS);
          return result;
        }
      } catch { /* fall through to API */ }
    }

    // Standard list: fetch thread IDs then get each in parallel
    const listResult = await t.gmail.api.threads.list({
      maxResults,
      labelIds: ["INBOX"],
      ...(searchQuery ? { q: searchQuery } : {}),
    });
    const rawThreads: Array<{ id?: string }> = listResult?.threads ?? [];

    const threads = await Promise.all(
      rawThreads.map(async (raw) => {
        const id = raw.id ?? crypto.randomUUID();
        const tk = `thread:${tenantId}:${id}`;
        const ct = cache.get<EmailThread>(tk);
        if (ct) return ct;
        try {
          const full = await t.gmail.api.threads.get({ id });
          const thread = normalizeThread(full, tenantId, userId);
          cache.set(tk, thread, TTL.THREAD);
          return thread;
        } catch {
          return { id, tenantId, ownerUserId: userId, subject: "(no subject)", snippet: "", from: "unknown", updatedAt: new Date().toISOString(), isUnread: false, labelIds: ["INBOX"] } satisfies EmailThread;
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

export async function fetchGmailThread(tenantId: string, threadId: string, userId: string, scopedIds?: Set<string>): Promise<EmailThread | undefined> {
  if (!isCorsairConfigured()) return getEmailThreadById(tenantId, threadId, scopedIds ?? new Set([userId]));

  const cacheKey = `thread:${tenantId}:${threadId}`;
  const cached = cache.get<EmailThread>(cacheKey);
  if (cached) return cached;

  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (tenant as any).gmail.api.threads.get({ id: threadId });
    if (!result) return undefined;
    const thread = normalizeThread(result, tenantId, userId);
    cache.set(cacheKey, thread, TTL.THREAD);
    return thread;
  } catch {
    return getEmailThreadById(tenantId, threadId, scopedIds ?? new Set([userId]));
  }
}

// ── listLabels ────────────────────────────────────────────────────────────────

export async function listGmailLabels(tenantId: string): Promise<Array<{ id: string; name: string; type: string; threadsUnread?: number }>> {
  const cacheKey = `labels:${tenantId}`;
  const cached = cache.get<Array<{ id: string; name: string; type: string; threadsUnread?: number }>>(cacheKey);
  if (cached) return cached;
  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (tenant as any).gmail.api.labels.list({});
    const labels = (result?.labels ?? []).map((l: any) => ({ id: l.id, name: l.name, type: l.type, threadsUnread: l.threadsUnread }));
    cache.set(cacheKey, labels, 120_000); // 2 min cache
    return labels;
  } catch { return []; }
}

// ── sendEmail ─────────────────────────────────────────────────────────────────

export async function sendEmail(tenantId: string, opts: { to: string; subject: string; body: string }): Promise<{ id?: string; threadId?: string }> {
  const raw = buildRawMessage(opts);
  const tenant = corsair.withTenant(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (tenant as any).gmail.api.messages.send({ raw });
  cache.invalidatePrefix(`threads:${tenantId}`);
  return result;
}

// ── replyToThread ─────────────────────────────────────────────────────────────

export async function replyToThread(tenantId: string, opts: { threadId: string; to: string; subject: string; body: string; messageId?: string }): Promise<{ id?: string; threadId?: string }> {
  const raw = buildRawMessage({ to: opts.to, subject: opts.subject.startsWith("Re:") ? opts.subject : `Re: ${opts.subject}`, body: opts.body, inReplyTo: opts.messageId, references: opts.messageId });
  const tenant = corsair.withTenant(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (tenant as any).gmail.api.messages.send({ raw, threadId: opts.threadId });
  cache.invalidatePrefix(`threads:${tenantId}`);
  cache.delete(`thread:${tenantId}:${opts.threadId}`);
  return result;
}

// ── modifyThreadLabels ────────────────────────────────────────────────────────

export async function modifyThreadLabels(tenantId: string, threadId: string, addLabelIds: string[], removeLabelIds: string[]): Promise<{ id?: string }> {
  const tenant = corsair.withTenant(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (tenant as any).gmail.api.threads.modify({ id: threadId, addLabelIds, removeLabelIds });
  cache.invalidatePrefix(`threads:${tenantId}`);
  cache.delete(`thread:${tenantId}:${threadId}`);
  return result;
}

// ── trashThread / untrashThread ───────────────────────────────────────────────

export async function trashThread(tenantId: string, threadId: string): Promise<void> {
  const tenant = corsair.withTenant(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (tenant as any).gmail.api.threads.trash({ id: threadId });
  cache.invalidatePrefix(`threads:${tenantId}`);
  cache.delete(`thread:${tenantId}:${threadId}`);
}

export async function untrashThread(tenantId: string, threadId: string): Promise<void> {
  const tenant = corsair.withTenant(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (tenant as any).gmail.api.threads.untrash({ id: threadId });
  cache.invalidatePrefix(`threads:${tenantId}`);
  cache.delete(`thread:${tenantId}:${threadId}`);
}

// ── batchModifyMessages ───────────────────────────────────────────────────────

export async function batchModifyMessages(tenantId: string, ids: string[], addLabelIds: string[], removeLabelIds: string[]): Promise<void> {
  const tenant = corsair.withTenant(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (tenant as any).gmail.api.messages.batchModify({ ids, addLabelIds, removeLabelIds });
  cache.invalidatePrefix(`threads:${tenantId}`);
}

// ── Draft operations ──────────────────────────────────────────────────────────

export async function listDrafts(tenantId: string, maxResults = 10): Promise<Array<{ id: string; snippet?: string }>> {
  const cacheKey = `drafts:${tenantId}`;
  const cached = cache.get<Array<{ id: string; snippet?: string }>>(cacheKey);
  if (cached) return cached;
  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (tenant as any).gmail.api.drafts.list({ maxResults });
    const drafts = (result?.drafts ?? []).map((d: any) => ({ id: d.id, snippet: d.message?.snippet }));
    cache.set(cacheKey, drafts, 30_000);
    return drafts;
  } catch { return []; }
}

export async function createDraft(tenantId: string, opts: { to: string; subject: string; body: string }): Promise<{ id?: string }> {
  const raw = buildRawMessage(opts);
  const tenant = corsair.withTenant(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (tenant as any).gmail.api.drafts.create({ draft: { message: { raw } } });
  cache.delete(`drafts:${tenantId}`);
  return result;
}

export async function sendDraft(tenantId: string, draftId: string): Promise<{ id?: string; threadId?: string }> {
  const tenant = corsair.withTenant(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (tenant as any).gmail.api.drafts.send({ id: draftId });
  cache.delete(`drafts:${tenantId}`);
  cache.invalidatePrefix(`threads:${tenantId}`);
  return result;
}

export async function deleteDraft(tenantId: string, draftId: string): Promise<void> {
  const tenant = corsair.withTenant(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (tenant as any).gmail.api.drafts.delete({ id: draftId });
  cache.delete(`drafts:${tenantId}`);
}
