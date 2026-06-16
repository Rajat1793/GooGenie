/**
 * Gmail integration — full Corsair Gmail API surface.
 * Uses DB search (gmail.db.messages.search) for near-zero latency search.
 * Falls back to API calls only when needed. TTL cache prevents redundant fetches.
 */
import { corsair, isCorsairConfigured } from "./corsair";
import { listEmailThreads, getEmailThreadById } from "../domain/email-store";
import type { EmailThread } from "../domain/email-store";
import { cache, TTL } from "../security/cache";
import { stripHtml } from "../lib/html";

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

/**
 * Build an EmailThread from Corsair's locally-synced DB rows.
 *
 * Per https://docs.corsair.dev/plugins/gmail/database the `messages` table
 * stores subject / from / to / body / snippet / threadId / internalDate per
 * message — exactly what we need to render the inbox list view without a
 * single Gmail API round-trip.
 *
 * Returns null when the DB rows don't contain enough info to safely render
 * (e.g. labelIds undefined on every msg → can't decide UNREAD or category).
 * The caller will fall back to the API for that one thread.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildThreadFromDbRows(tenantId: string, userId: string, threadId: string, msgs: any[]): EmailThread | null {
  if (!msgs || msgs.length === 0) return null;
  // Sort by internalDate ascending so [0] = first message in thread
  const sorted = [...msgs].sort((a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0));
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];

  // Union of labels across messages. If field is missing on every msg the
  // sync hasn't populated label data for this thread yet — give up and let
  // the caller hit the API.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelIdsArrays: string[][] = sorted.map((m: any) => Array.isArray(m.labelIds) ? m.labelIds : []);
  const anyLabels = labelIdsArrays.some((arr) => arr.length > 0);
  if (!anyLabels) return null;
  const allLabelIds = [...new Set(labelIdsArrays.flat())];

  // Body: DB stores raw `body` per message. We don't know if it's HTML or
  // plaintext, so detect heuristically. List view only reads `snippet`, so
  // bodyHtml here is best-effort for downstream consumers.
  const rawBody: string = typeof first.body === "string" ? first.body : "";
  const looksHtml = /<[a-z][\s\S]*>/i.test(rawBody);

  return {
    id: threadId,
    tenantId,
    ownerUserId: userId,
    subject: first.subject || "(no subject)",
    snippet: first.snippet || (looksHtml ? stripHtml(rawBody).slice(0, 200) : rawBody.slice(0, 200)),
    bodyHtml: looksHtml ? rawBody : undefined,
    from: first.from || "unknown",
    updatedAt: latest.internalDate
      ? new Date(Number(latest.internalDate)).toISOString()
      : new Date().toISOString(),
    isUnread: allLabelIds.includes("UNREAD"),
    labelIds: allLabelIds,
  };
}

// ── fetchGmailThreads ────────────────────────────────────────────────────────
//
// Optimization (per https://docs.corsair.dev/plugins/gmail/database):
//
//   Hot path = ZERO per-thread Gmail API calls. We only ever call:
//     1. `gmail.api.threads.list` — once, to get the ordered thread IDs
//        (necessary because the DB threads table doesn't track the INBOX
//         label or message order).
//     2. `gmail.db.messages.search({ threadId: { in: missIds } })` — once,
//        batched, to pull every message for the IDs we don't already have
//        cached. Corsair keeps this DB synced via webhooks (we wired those
//        last turn), so reads are near-instant.
//     3. `gmail.api.threads.get({ id })` — only as a fallback for IDs the
//        DB doesn't yet have (cold sync, very first request after connect).
//
// Before this change: ~11 API calls per inbox load (1 list + 10 gets).
// After:               1 API call + 1 DB query.

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

    // ── Search path: query DB first, then fill ordered IDs ──────────────────
    if (searchQuery) {
      try {
        const dbResults = await t.gmail.db.messages.search({
          data: {
            OR: [
              { subject: { contains: searchQuery } },
              { from: { contains: searchQuery } },
              { body: { contains: searchQuery } },
            ],
          },
          limit: maxResults * 5,
        });

        if (dbResults?.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const threadIds = [...new Set<string>(dbResults.map((m: any) => m.threadId).filter(Boolean))]
            .slice(0, maxResults);
          const threads = await hydrateThreads(t, tenantId, userId, threadIds);
          if (threads.length > 0) {
            cache.set(cacheKey, threads, TTL.THREADS);
            return threads;
          }
        }
      } catch { /* fall through to API list */ }
    }

    // ── List path ──────────────────────────────────────────────────────────
    // Get ordered IDs via API (DB threads table has no labelIds for INBOX).
    // When the user is searching, span all mail (Promotions, Sent, Archive)
    // by omitting the INBOX label filter.
    const listResult = await t.gmail.api.threads.list({
      maxResults,
      ...(searchQuery
        ? { q: searchQuery }
        : { labelIds: ["INBOX"] }),
    });
    const rawThreads: Array<{ id?: string }> = listResult?.threads ?? [];
    const orderedIds = rawThreads.map((r) => r.id).filter((x): x is string => typeof x === "string");

    const threads = await hydrateThreads(t, tenantId, userId, orderedIds);
    cache.set(cacheKey, threads, TTL.THREADS);
    return threads;
  } catch {
    return listEmailThreads(tenantId, new Set([userId]));
  }
}

/**
 * Resolve a list of thread IDs into EmailThread objects, in order, using:
 *   1) the per-thread cache,
 *   2) one batched Corsair DB query for the rest,
 *   3) per-thread API fallback only for IDs not yet synced to DB.
 */
async function hydrateThreads(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any,
  tenantId: string,
  userId: string,
  ids: string[]
): Promise<EmailThread[]> {
  if (ids.length === 0) return [];

  // Step 1: resolve from per-thread cache.
  const fromCache = new Map<string, EmailThread>();
  const missIds: string[] = [];
  for (const id of ids) {
    const cached = cache.get<EmailThread>(`thread:${tenantId}:${id}`);
    if (cached) fromCache.set(id, cached);
    else missIds.push(id);
  }

  // Step 2: batched DB query for everything not in cache.
  const fromDb = new Map<string, EmailThread>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbMessages: any[] = [];
  if (missIds.length > 0) {
    try {
      dbMessages = await t.gmail.db.messages.search({
        data: { threadId: { in: missIds } },
        // Up to 10 messages per thread is plenty for list rendering
        limit: missIds.length * 10,
      }) ?? [];
    } catch {
      dbMessages = [];
    }

    if (dbMessages.length > 0) {
      const byThread = new Map<string, typeof dbMessages>();
      for (const m of dbMessages) {
        const tid = m?.threadId;
        if (!tid) continue;
        const arr = byThread.get(tid);
        if (arr) arr.push(m);
        else byThread.set(tid, [m]);
      }
      for (const [tid, msgs] of byThread.entries()) {
        const built = buildThreadFromDbRows(tenantId, userId, tid, msgs);
        if (built) {
          cache.set(`thread:${tenantId}:${tid}`, built, TTL.THREAD);
          fromDb.set(tid, built);
        }
      }
    }
  }

  // Step 3: API fallback for IDs the DB couldn't resolve (cold sync).
  const stillMissing = missIds.filter((id) => !fromDb.has(id));
  const fromApi = new Map<string, EmailThread>();
  if (stillMissing.length > 0) {
    await Promise.all(stillMissing.map(async (id) => {
      try {
        const full = await t.gmail.api.threads.get({ id });
        if (full) {
          const thread = normalizeThread(full, tenantId, userId);
          cache.set(`thread:${tenantId}:${id}`, thread, TTL.THREAD);
          fromApi.set(id, thread);
        }
      } catch {
        fromApi.set(id, {
          id, tenantId, ownerUserId: userId,
          subject: "(no subject)", snippet: "", from: "unknown",
          updatedAt: new Date().toISOString(),
          isUnread: false, labelIds: ["INBOX"],
        });
      }
    }));
  }

  // Stitch back in original order.
  return ids
    .map((id) => fromCache.get(id) ?? fromDb.get(id) ?? fromApi.get(id))
    .filter((x): x is EmailThread => Boolean(x));
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
    const t = tenant as any;

    // Try Corsair's locally-synced DB first — same optimization as the list
    // view. We only need the API when the DB doesn't yet have this thread
    // (cold sync) or when its rows are missing labelIds.
    try {
      const dbMessages = await t.gmail.db.messages.search({
        data: { threadId: { equals: threadId } },
        limit: 50,
      }) ?? [];
      if (dbMessages.length > 0) {
        const built = buildThreadFromDbRows(tenantId, userId, threadId, dbMessages);
        if (built) {
          cache.set(cacheKey, built, TTL.THREAD);
          return built;
        }
      }
    } catch { /* fall through to API */ }

    const result = await t.gmail.api.threads.get({ id: threadId });
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
