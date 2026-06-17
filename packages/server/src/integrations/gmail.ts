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

// ── Reply-needed query (Feature A2) ──────────────────────────────────────────
//
// "Threads waiting on me" = threads where the most recent message is from
// someone other than me, AND I haven't sent a reply after that message.
// Implemented with two cheap Corsair DB queries — no Gmail API calls.

export interface ReplyNeededThread {
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  lastInboundAt: string;
  daysWaiting: number;
  /** Heuristic urgency: 0..3 (0 = none, 3 = "ASAP / today") */
  urgency: number;
  labelIds: string[];
}

const URGENCY_PATTERNS: Array<{ re: RegExp; weight: number }> = [
  { re: /\b(asap|urgent|immediately|right now|today)\b/i, weight: 3 },
  { re: /\b(by\s+(eod|cob|tomorrow|friday|monday|tuesday|wednesday|thursday|saturday|sunday))\b/i, weight: 2 },
  { re: /\b(deadline|due\s+(today|tomorrow|this\s+week))\b/i, weight: 2 },
  { re: /\?/, weight: 1 },
  { re: /\b(please\s+confirm|need\s+your\s+(approval|sign\s*-?\s*off))\b/i, weight: 2 },
];

function scoreUrgency(text: string): number {
  let score = 0;
  for (const { re, weight } of URGENCY_PATTERNS) {
    if (re.test(text)) score = Math.max(score, weight);
  }
  return Math.min(3, score);
}

/**
 * Returns threads where the last message is FROM someone else and the user
 * has not sent a reply after it. Uses Corsair's local `gmail.db.messages`
 * — does NOT hit the Gmail API.
 *
 * `userEmail` should be the signed-in user's primary email so we can tell
 * "from me" vs "from them" without parsing the `From` header heuristically.
 */
export async function fetchReplyNeededThreads(
  tenantId: string,
  userId: string,
  userEmail: string | null,
  limit = 50,
): Promise<ReplyNeededThread[]> {
  if (!isCorsairConfigured()) return [];
  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tenant as any;

    // Get the most recent ~200 messages; group by thread, find tails.
    const recent = await t.gmail.db.messages.search({
      data: {},
      orderBy: { internalDate: "desc" },
      limit: 400,
    }).catch(() => [] as unknown[]);

    if (!Array.isArray(recent) || recent.length === 0) return [];

    type Msg = { threadId?: string; from?: string; to?: string; subject?: string; snippet?: string; body?: string; internalDate?: string | number; labelIds?: string[] };
    const byThread = new Map<string, Msg[]>();
    for (const raw of recent as Msg[]) {
      if (!raw.threadId) continue;
      const arr = byThread.get(raw.threadId);
      if (arr) arr.push(raw);
      else byThread.set(raw.threadId, [raw]);
    }

    const lowerMyEmail = userEmail?.toLowerCase() ?? "";
    const isFromMe = (m: Msg): boolean => {
      const from = (m.from ?? "").toLowerCase();
      return lowerMyEmail.length > 0 && from.includes(lowerMyEmail);
    };

    const out: ReplyNeededThread[] = [];
    for (const [threadId, msgs] of byThread) {
      if (msgs.length === 0) continue;
      const sorted = msgs.sort(
        (a, b) => Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0),
      );
      const last = sorted[0];
      // Skip if last message is from me — nothing waiting.
      if (isFromMe(last)) continue;
      // Skip if any of my replies AFTER this last inbound exist (shouldn't
      // happen given last is "the most recent" by date, but defensive).
      const lastDate = Number(last.internalDate ?? 0);
      const repliedAfter = sorted.some(
        (m) => isFromMe(m) && Number(m.internalDate ?? 0) > lastDate,
      );
      if (repliedAfter) continue;

      // Skip system labels we'd never reply to.
      const labels = last.labelIds ?? [];
      if (labels.includes("SPAM") || labels.includes("TRASH") || labels.includes("DRAFT")) continue;
      // Skip promotions / social / forums / updates — usually no-reply.
      if (
        labels.includes("CATEGORY_PROMOTIONS") ||
        labels.includes("CATEGORY_SOCIAL") ||
        labels.includes("CATEGORY_FORUMS")
      ) continue;

      const lastDateMs = lastDate || Date.now();
      const daysWaiting = Math.max(0, Math.floor((Date.now() - lastDateMs) / (24 * 3600 * 1000)));
      const urgencyText = `${last.subject ?? ""} ${last.snippet ?? ""} ${typeof last.body === "string" ? last.body.slice(0, 1000) : ""}`;

      out.push({
        threadId,
        subject: last.subject || "(no subject)",
        from: last.from || "unknown",
        snippet: (last.snippet ?? "").slice(0, 200),
        lastInboundAt: new Date(lastDateMs).toISOString(),
        daysWaiting,
        urgency: scoreUrgency(urgencyText),
        labelIds: labels,
      });
    }

    // Rank: urgency desc → daysWaiting desc → recency desc.
    out.sort((a, b) => {
      if (b.urgency !== a.urgency) return b.urgency - a.urgency;
      if (b.daysWaiting !== a.daysWaiting) return b.daysWaiting - a.daysWaiting;
      return new Date(b.lastInboundAt).getTime() - new Date(a.lastInboundAt).getTime();
    });

    return out.slice(0, limit);
  } catch {
    return [];
  }
}

// ── Newsletter / List-Unsubscribe scan (Feature C2) ──────────────────────────
//
// Scans Corsair's local message cache for messages with a List-Unsubscribe
// header. Groups by sender. Surfaces the ones the user has never opened.

export interface NewsletterSender {
  email: string;
  displayName: string;
  totalMessages: number;
  unreadMessages: number;
  /** Most recent message id (lets caller invoke the unsubscribe URL). */
  latestMessageId: string;
  latestThreadId: string;
  latestDate: string;
  /** Parsed List-Unsubscribe URLs: at most one https + one mailto. */
  unsubscribeUrls: string[];
  /** Did Gmail's auto-One-Click List-Unsubscribe-Post field appear? */
  oneClick: boolean;
}

function parseListUnsubscribe(headerVal: string): { urls: string[]; mailto?: string } {
  // Format: "<https://…>, <mailto:unsubscribe@x>"
  const urls: string[] = [];
  let mailto: string | undefined;
  const matches = headerVal.match(/<([^>]+)>/g) ?? [];
  for (const m of matches) {
    const inner = m.slice(1, -1).trim();
    if (inner.toLowerCase().startsWith("mailto:")) mailto = inner;
    else if (/^https?:\/\//i.test(inner)) urls.push(inner);
  }
  return { urls, mailto };
}

function extractEmailAddress(from: string): string {
  const match = /<([^>]+)>/.exec(from);
  return (match ? match[1] : from).trim().toLowerCase();
}

function extractDisplayName(from: string): string {
  const match = /^(.*?)\s*<[^>]+>\s*$/.exec(from);
  return (match ? match[1] : from).replace(/^"|"$/g, "").trim();
}

export async function fetchNewsletterSenders(
  tenantId: string,
  limit = 30,
): Promise<NewsletterSender[]> {
  if (!isCorsairConfigured()) return [];
  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tenant as any;
    // Pull a generous window — most newsletters land in the last few weeks.
    const recent = await t.gmail.db.messages.search({
      data: {},
      orderBy: { internalDate: "desc" },
      limit: 1000,
    }).catch(() => [] as unknown[]);
    if (!Array.isArray(recent) || recent.length === 0) return [];

    type Msg = {
      id?: string;
      threadId?: string;
      from?: string;
      subject?: string;
      internalDate?: string | number;
      labelIds?: string[];
      headers?: Array<{ name?: string; value?: string }>;
      // Some Corsair builds flatten headers onto top-level fields.
      listUnsubscribe?: string;
      listUnsubscribePost?: string;
    };

    const senders = new Map<string, NewsletterSender>();
    for (const raw of recent as Msg[]) {
      const headersArr: Array<{ name?: string; value?: string }> = Array.isArray(raw.headers) ? raw.headers : [];
      const listUnsub =
        raw.listUnsubscribe ?? getHeader(headersArr, "list-unsubscribe");
      if (!listUnsub) continue;
      const fromRaw = raw.from ?? "";
      const email = extractEmailAddress(fromRaw);
      if (!email) continue;
      const oneClick = !!(raw.listUnsubscribePost ?? getHeader(headersArr, "list-unsubscribe-post"));
      const { urls, mailto } = parseListUnsubscribe(listUnsub);
      const allUrls = [...urls, ...(mailto ? [mailto] : [])];
      if (allUrls.length === 0) continue;

      const labels = raw.labelIds ?? [];
      const isUnread = labels.includes("UNREAD");
      const dateMs = Number(raw.internalDate ?? 0);

      const existing = senders.get(email);
      if (existing) {
        existing.totalMessages += 1;
        if (isUnread) existing.unreadMessages += 1;
        if (dateMs > new Date(existing.latestDate).getTime()) {
          existing.latestDate = new Date(dateMs || Date.now()).toISOString();
          if (raw.id) existing.latestMessageId = raw.id;
          if (raw.threadId) existing.latestThreadId = raw.threadId;
          existing.unsubscribeUrls = allUrls;
          existing.oneClick = oneClick;
        }
      } else {
        senders.set(email, {
          email,
          displayName: extractDisplayName(fromRaw) || email,
          totalMessages: 1,
          unreadMessages: isUnread ? 1 : 0,
          latestMessageId: raw.id ?? "",
          latestThreadId: raw.threadId ?? "",
          latestDate: new Date(dateMs || Date.now()).toISOString(),
          unsubscribeUrls: allUrls,
          oneClick,
        });
      }
    }

    // Rank: senders with the highest unread-rate first, then total volume.
    const ranked = [...senders.values()].sort((a, b) => {
      const unreadRateA = a.unreadMessages / Math.max(1, a.totalMessages);
      const unreadRateB = b.unreadMessages / Math.max(1, b.totalMessages);
      if (unreadRateB !== unreadRateA) return unreadRateB - unreadRateA;
      return b.totalMessages - a.totalMessages;
    });
    return ranked.slice(0, limit);
  } catch {
    return [];
  }
}

// ── Per-sender message slice (Feature B1 — Meeting brief) ────────────────────
//
// Returns the user's recent threads with a given email address (in either the
// From or To header). Entirely local DB query.

export interface SenderThreadSlice {
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  direction: "inbound" | "outbound" | "unknown";
}

export async function fetchThreadsWithEmail(
  tenantId: string,
  email: string,
  myEmail: string | null,
  limit = 5,
): Promise<SenderThreadSlice[]> {
  if (!isCorsairConfigured() || !email) return [];
  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tenant as any;
    const rows = await t.gmail.db.messages.search({
      data: {
        OR: [
          { from: { contains: email } },
          { to: { contains: email } },
        ],
      },
      orderBy: { internalDate: "desc" },
      limit: 50,
    }).catch(() => [] as unknown[]);
    if (!Array.isArray(rows) || rows.length === 0) return [];

    type Msg = { id?: string; threadId?: string; from?: string; to?: string; subject?: string; snippet?: string; internalDate?: string | number };
    const lowerMyEmail = myEmail?.toLowerCase() ?? "";
    const seen = new Set<string>();
    const out: SenderThreadSlice[] = [];
    for (const r of rows as Msg[]) {
      if (!r.threadId || seen.has(r.threadId)) continue;
      seen.add(r.threadId);
      const fromLower = (r.from ?? "").toLowerCase();
      const direction: SenderThreadSlice["direction"] =
        lowerMyEmail && fromLower.includes(lowerMyEmail)
          ? "outbound"
          : fromLower.includes(email.toLowerCase())
          ? "inbound"
          : "unknown";
      out.push({
        threadId: r.threadId,
        subject: r.subject || "(no subject)",
        from: r.from || "unknown",
        snippet: (r.snippet ?? "").slice(0, 240),
        date: new Date(Number(r.internalDate ?? 0) || Date.now()).toISOString(),
        direction,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

// ── Recent unread inbox messages from local DB (Feature A4) ──────────────────
//
// Returns the N most-recent unread INBOX messages from Corsair's local cache,
// minus anything already labeled by a previous auto-categorize pass.

export interface UnreadInboxMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  internalDate: number;
}

export async function fetchRecentUnreadInbox(
  tenantId: string,
  limit = 20,
): Promise<UnreadInboxMessage[]> {
  if (!isCorsairConfigured()) return [];
  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tenant as any;
    const rows = await t.gmail.db.messages.search({
      data: {},
      orderBy: { internalDate: "desc" },
      limit: limit * 4, // overfetch, then filter client-side
    }).catch(() => [] as unknown[]);
    if (!Array.isArray(rows) || rows.length === 0) return [];
    type Row = { id?: string; threadId?: string; from?: string; subject?: string; snippet?: string; internalDate?: string | number; labelIds?: string[] };
    const out: UnreadInboxMessage[] = [];
    for (const r of rows as Row[]) {
      const labels = r.labelIds ?? [];
      if (!labels.includes("INBOX")) continue;
      if (!labels.includes("UNREAD")) continue;
      // Skip if already auto-labelled (any GooGenie/* label).
      if (labels.some((l) => l.startsWith("Googenie/"))) continue;
      if (!r.id || !r.threadId) continue;
      out.push({
        id: r.id,
        threadId: r.threadId,
        subject: r.subject || "(no subject)",
        from: r.from || "unknown",
        snippet: (r.snippet ?? "").slice(0, 400),
        internalDate: Number(r.internalDate ?? 0) || Date.now(),
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

// ── Ensure a Gmail label exists, returning its id (Feature A4) ───────────────

const labelCache = new Map<string, string>(); // key = `${tenantId}:${name}` → labelId

export async function ensureGmailLabel(
  tenantId: string,
  name: string,
): Promise<string | null> {
  const cacheKey = `${tenantId}:${name}`;
  const hit = labelCache.get(cacheKey);
  if (hit) return hit;
  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tenant as any;
    const existing = await t.gmail.api.labels.getMany().catch(() => null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: Array<{ id?: string; name?: string }> = existing?.labels ?? [];
    const found = list.find((l) => l.name === name);
    if (found?.id) {
      labelCache.set(cacheKey, found.id);
      return found.id;
    }
    const created = await t.gmail.api.labels.create({
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }).catch(() => null);
    if (created?.id) {
      labelCache.set(cacheKey, created.id);
      return created.id;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Feature A1: Sender Intelligence Dashboard ────────────────────────────────

export interface SenderStats {
  email: string;
  displayName: string;
  totalThreads: number;
  lastContactDate: string | null;
  awaitingMyReply: number;
  /** Avg hours from their message → my reply. */
  avgMyResponseHours: number | null;
  /** Avg hours from my message → their reply. */
  avgTheirResponseHours: number | null;
  recentThreads: Array<{ threadId: string; subject: string; date: string; direction: "inbound" | "outbound" }>;
}

/**
 * Compute sender intelligence stats from Corsair's local message cache.
 * Parses direction per message by matching from/to against myEmail.
 */
export async function fetchSenderStats(
  tenantId: string,
  senderEmail: string,
  myEmail: string | null,
  limit = 20,
): Promise<SenderStats | null> {
  if (!isCorsairConfigured() || !senderEmail) return null;
  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tenant as any;
    const rows = await t.gmail.db.messages.search({
      data: {
        OR: [
          { from: { contains: senderEmail } },
          { to: { contains: senderEmail } },
        ],
      },
      orderBy: { internalDate: "desc" },
      limit: 200,
    }).catch(() => [] as unknown[]);
    if (!Array.isArray(rows) || rows.length === 0) return null;

    type Msg = { id?: string; threadId?: string; from?: string; to?: string; subject?: string; internalDate?: string | number };
    const lowerMyEmail = myEmail?.toLowerCase() ?? "";
    const lowerSender = senderEmail.toLowerCase();

    // Group by thread, track direction per message.
    const byThread = new Map<string, Msg[]>();
    for (const r of rows as Msg[]) {
      if (!r.threadId) continue;
      const arr = byThread.get(r.threadId);
      if (arr) arr.push(r);
      else byThread.set(r.threadId, [r]);
    }

    const isFromMe = (m: Msg): boolean => {
      const from = (m.from ?? "").toLowerCase();
      return lowerMyEmail.length > 0 && from.includes(lowerMyEmail);
    };
    const isFromSender = (m: Msg): boolean => {
      const from = (m.from ?? "").toLowerCase();
      return from.includes(lowerSender);
    };

    let awaitingMyReply = 0;
    const recentThreads: SenderStats["recentThreads"] = [];
    const myResponseTimes: number[] = [];
    const theirResponseTimes: number[] = [];
    let lastContactMs = 0;

    for (const [threadId, msgs] of byThread) {
      const sorted = msgs.sort((a, b) => Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0));
      const latest = sorted[0];
      const latestMs = Number(latest.internalDate ?? 0);
      if (latestMs > lastContactMs) lastContactMs = latestMs;

      // Awaiting my reply = last message is from sender.
      if (isFromSender(latest) && !isFromMe(latest)) awaitingMyReply++;

      // Recent threads for display.
      if (recentThreads.length < limit) {
        const direction = isFromMe(latest) ? "outbound" : isFromSender(latest) ? "inbound" : "inbound";
        recentThreads.push({
          threadId,
          subject: latest.subject || "(no subject)",
          date: new Date(latestMs || Date.now()).toISOString(),
          direction,
        });
      }

      // Response time calculation: find pairs of (their msg → my msg) or vice versa.
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        const currMs = Number(current.internalDate ?? 0);
        const nextMs = Number(next.internalDate ?? 0);
        if (currMs === 0 || nextMs === 0) continue;
        const gapHours = Math.abs(currMs - nextMs) / (1000 * 3600);
        if (gapHours > 24 * 7) continue; // ignore week+ gaps
        if (isFromMe(current) && isFromSender(next)) {
          // They replied to me.
          theirResponseTimes.push(gapHours);
        } else if (isFromSender(current) && isFromMe(next)) {
          // I replied to them.
          myResponseTimes.push(gapHours);
        }
      }
    }

    const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const displayName = rows.find((r) => isFromSender(r as Msg))?.from ?? senderEmail;

    return {
      email: senderEmail,
      displayName: extractDisplayName(displayName),
      totalThreads: byThread.size,
      lastContactDate: lastContactMs > 0 ? new Date(lastContactMs).toISOString() : null,
      awaitingMyReply,
      avgMyResponseHours: avg(myResponseTimes),
      avgTheirResponseHours: avg(theirResponseTimes),
      recentThreads,
    };
  } catch {
    return null;
  }
}

// ── Feature A5: OOO detection ─────────────────────────────────────────────────

export interface OOOInfo {
  isOOO: boolean;
  returnDate: string | null;
  autoReplySnippet: string | null;
}

/**
 * Check if the most recent message from a sender was an auto-reply (OOO).
 * Scans Auto-Submitted / Precedence headers + snippet keywords.
 */
export async function checkSenderOOO(
  tenantId: string,
  senderEmail: string,
  limit = 5,
): Promise<OOOInfo> {
  if (!isCorsairConfigured()) return { isOOO: false, returnDate: null, autoReplySnippet: null };
  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tenant as any;
    const rows = await t.gmail.db.messages.search({
      data: { from: { contains: senderEmail } },
      orderBy: { internalDate: "desc" },
      limit,
    }).catch(() => [] as unknown[]);
    if (!Array.isArray(rows) || rows.length === 0) return { isOOO: false, returnDate: null, autoReplySnippet: null };

    type Msg = { headers?: Array<{ name?: string; value?: string }>; subject?: string; snippet?: string; body?: string };
    for (const raw of rows as Msg[]) {
      const headers = Array.isArray(raw.headers) ? raw.headers : [];
      const autoSubmitted = getHeader(headers, "auto-submitted");
      const precedence = getHeader(headers, "precedence");
      const subject = (raw.subject ?? "").toLowerCase();
      const snippet = (raw.snippet ?? "").toLowerCase();
      const body = (typeof raw.body === "string" ? raw.body : "").toLowerCase();
      const blob = `${subject} ${snippet} ${body}`;

      // Positive signals: auto-submitted, precedence=auto-reply, or OOO keywords.
      if (autoSubmitted.toLowerCase().includes("auto-replied") || precedence.toLowerCase().includes("auto-reply")) {
        // Try to extract return date from body.
        const returnMatch = /return(?:ing)?\s+(?:on|after)?\s+(\w+\s+\d{1,2}(?:,?\s+\d{4})?)/i.exec(blob);
        const returnDate = returnMatch ? returnMatch[1] : null;
        return {
          isOOO: true,
          returnDate,
          autoReplySnippet: (raw.snippet ?? "").slice(0, 200),
        };
      }
      if (/\b(out of (?:the )?office|away from|on vacation|on leave|unavailable)\b/i.test(blob)) {
        const returnMatch = /(?:return|back)\s+(?:on|after)?\s+(\w+\s+\d{1,2}(?:,?\s+\d{4})?)/i.exec(blob);
        const returnDate = returnMatch ? returnMatch[1] : null;
        return {
          isOOO: true,
          returnDate,
          autoReplySnippet: (raw.snippet ?? "").slice(0, 200),
        };
      }
    }
    return { isOOO: false, returnDate: null, autoReplySnippet: null };
  } catch {
    return { isOOO: false, returnDate: null, autoReplySnippet: null };
  }
}

// ── Feature C4: Compose from past style ──────────────────────────────────────

export interface SentMessageSample {
  subject: string;
  snippet: string;
  body: string;
  date: string;
}

/**
 * Fetch the user's last N messages SENT TO a specific recipient. Used as
 * style examples for personalized composition (Feature C4).
 *
 * Filters Corsair's local cache for messages where:
 *   - `to` includes the recipient
 *   - `from` includes the user's own email (or the message has SENT label)
 */
export async function fetchSentMessagesTo(
  tenantId: string,
  recipientEmail: string,
  myEmail: string | null,
  limit = 5,
): Promise<SentMessageSample[]> {
  if (!isCorsairConfigured() || !recipientEmail) return [];
  try {
    const tenant = corsair.withTenant(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tenant as any;
    const rows = await t.gmail.db.messages.search({
      data: { to: { contains: recipientEmail } },
      orderBy: { internalDate: "desc" },
      limit: limit * 4,
    }).catch(() => [] as unknown[]);
    if (!Array.isArray(rows) || rows.length === 0) return [];

    type Row = {
      from?: string;
      to?: string;
      subject?: string;
      snippet?: string;
      body?: string;
      internalDate?: string | number;
      labelIds?: string[];
    };
    const lowerMe = myEmail?.toLowerCase() ?? "";
    const out: SentMessageSample[] = [];
    for (const r of rows as Row[]) {
      const labels = r.labelIds ?? [];
      const fromMe =
        (lowerMe.length > 0 && (r.from ?? "").toLowerCase().includes(lowerMe)) ||
        labels.includes("SENT");
      if (!fromMe) continue;
      const body = typeof r.body === "string" ? r.body : "";
      out.push({
        subject: r.subject || "(no subject)",
        snippet: (r.snippet ?? "").slice(0, 280),
        body: stripHtml(body).slice(0, 1500),
        date: new Date(Number(r.internalDate ?? 0) || Date.now()).toISOString(),
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}
