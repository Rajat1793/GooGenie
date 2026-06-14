/// <reference path="../contracts/request.d.ts" />
/**
 * AI-powered endpoints.
 *
 * POST /v1/ai/summarize-thread  — summarise an email thread (requires ai_summary)
 * POST /v1/ai/compose           — generate email body/subject (requires ai_compose)
 *
 * Both endpoints gracefully degrade when OPENAI_API_KEY is not set, returning
 * a structured "not configured" response rather than a 500.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { requireFeature } from "../auth/feature-gate.js";
import { createApiError } from "../security/errors.js";
import { emitAuditEvent } from "../security/audit.js";
import { fetchGmailThread } from "../integrations/gmail.js";
import { fetchGmailThreads } from "../integrations/gmail.js";
import { getCorsairTenant } from "../integrations/corsair-tenant.js";
import { chat, isAiAvailable, MODEL, embed } from "../integrations/openai.js";
import { aiCache } from "../lib/cache.js";
import { checkAvailability } from "../integrations/googlecalendar.js";
import { searchEmbeddings, embeddingsAvailable, upsertEmbedding, isAlreadyEmbedded } from "../db/embeddings.js";

export const aiRouter = Router();

// ── Strip HTML to plain text ──────────────────────────────────────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── POST /v1/ai/summarize-thread ──────────────────────────────────────────────
const summarizeSchema = z.object({
  thread_id: z.string().min(1),
});

aiRouter.post(
  "/ai/summarize-thread",
  requireAuth,
  requireFeature("ai_summary"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const parsed = summarizeSchema.safeParse(req.body);
      if (!parsed.success) throw createApiError("VALIDATION_ERROR", "thread_id is required", false, req.traceId);

      if (!isAiAvailable()) {
        res.status(200).json({
          ai_available: false,
          hint: "Set OPENAI_API_KEY in your environment to enable AI summaries.",
        });
        return;
      }

      // Cache hit?  Same user + same thread within 10 min returns instantly
      const cacheKey = `summary:${auth.userId}:${parsed.data.thread_id}`;
      const cached = aiCache.summary.get(cacheKey);
      if (cached) {
        res.status(200).json({ ...(cached as object), cached: true, ai_available: true });
        return;
      }

      // Fetch thread content via Corsair
      const tenant = getCorsairTenant(auth.userId);
      const thread = await fetchGmailThread(tenant, parsed.data.thread_id, auth.userId);
      if (!thread) throw createApiError("NOT_FOUND", "Thread not found", false, req.traceId);

      const content = thread.bodyHtml ? stripHtml(thread.bodyHtml) : thread.snippet;
      if (!content || content.length < 20) {
        res.status(200).json({ summary: "This email appears to be empty.", key_points: [], action_items: [], sentiment: "neutral", model: MODEL });
        return;
      }

      const prompt = `You are a helpful email assistant. Analyse this email thread and respond with ONLY valid JSON matching this exact shape:
{
  "summary": "2-3 sentence summary of the thread",
  "key_points": ["point 1", "point 2", "point 3"],
  "action_items": ["action 1", "action 2"],
  "sentiment": "positive|neutral|negative|urgent"
}

Email subject: ${thread.subject}
From: ${thread.from}

Email content:
${content.slice(0, 4000)}`;

      const raw = await chat(prompt, "You are a concise email summarisation assistant. Always respond with valid JSON only.", { jsonMode: true, maxTokens: 512 });
      if (!raw) {
        res.status(200).json({ summary: "Could not generate summary.", key_points: [], action_items: [], sentiment: "neutral", model: MODEL });
        return;
      }

      let result: { summary: string; key_points: string[]; action_items: string[]; sentiment: string };
      try {
        result = JSON.parse(raw);
      } catch {
        // Fallback if model didn't produce valid JSON
        result = { summary: raw.slice(0, 500), key_points: [], action_items: [], sentiment: "neutral" };
      }

      emitAuditEvent(req, "ai_summarize_thread", { thread_id: parsed.data.thread_id, model: MODEL });
      const payload = { ...result, model: MODEL, ai_available: true };
      aiCache.summary.set(cacheKey, payload);
      res.status(200).json({ ...payload, cached: false });
    } catch (err) { next(err); }
  }
);

// ── POST /v1/ai/compose ───────────────────────────────────────────────────────
const composeSchema = z.object({
  type: z.enum(["new", "reply"]),
  tone: z.enum(["professional", "friendly", "concise"]).default("professional"),
  context: z.string().max(1000),
  thread_snippet: z.string().max(2000).optional(), // existing thread for reply context
  recipient_name: z.string().max(100).optional(),
});

aiRouter.post(
  "/ai/compose",
  requireAuth,
  requireFeature("ai_compose"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = composeSchema.safeParse(req.body);
      if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid compose payload", false, req.traceId);

      if (!isAiAvailable()) {
        res.status(200).json({
          ai_available: false,
          hint: "Set OPENAI_API_KEY in your environment to enable AI compose.",
        });
        return;
      }

      const { type, tone, context, thread_snippet, recipient_name } = parsed.data;

      const toneInstructions: Record<string, string> = {
        professional: "formal, polished, business-appropriate language",
        friendly: "warm, approachable, conversational but still respectful",
        concise: "short and to the point — no fluff, under 5 sentences",
      };

      const basePrompt = type === "reply"
        ? `You are composing a ${tone} email reply. Original thread context:
---
${thread_snippet ?? "(no thread context)"}
---
The user wants to reply about: ${context}
${recipient_name ? `Recipient: ${recipient_name}` : ""}`
        : `You are composing a new ${tone} email about: ${context}
${recipient_name ? `To: ${recipient_name}` : ""}`;

      const prompt = `${basePrompt}

Use ${toneInstructions[tone]}.

Respond with ONLY valid JSON matching this exact shape:
{
  "subject": "email subject line (omit if this is a reply)",
  "body": "the main email body",
  "alternatives": ["shorter alternative body", "different angle or opening alternative body"]
}`;

      const raw = await chat(
        prompt,
        "You are an expert email writing assistant. Always respond with valid JSON only.",
        { jsonMode: true, maxTokens: 800 }
      );

      if (!raw) {
        res.status(200).json({ body: "Could not generate email.", alternatives: [], model: MODEL });
        return;
      }

      let result: { subject?: string; body: string; alternatives: string[] };
      try {
        result = JSON.parse(raw);
      } catch {
        result = { body: raw.slice(0, 800), alternatives: [] };
      }

      emitAuditEvent(req, "ai_compose", { type, tone, model: MODEL });
      res.status(200).json({ ...result, model: MODEL, ai_available: true });
    } catch (err) { next(err); }
  }
);

// ── POST /v1/ai/suggest-slots ─────────────────────────────────────────────────
// Smart calendar scheduler — natural-language meeting description -> ranked time slots
const suggestSlotsSchema = z.object({
  description: z.string().min(3).max(500),
  duration_minutes: z.number().int().min(15).max(480).default(30),
  earliest: z.string().datetime().optional(), // ISO 8601
  latest: z.string().datetime().optional(),
  attendee_emails: z.array(z.string().email()).max(10).optional(),
});

aiRouter.post(
  "/ai/suggest-slots",
  requireAuth,
  requireFeature("calendar_write"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const parsed = suggestSlotsSchema.safeParse(req.body);
      if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid suggest-slots payload", false, req.traceId);

      const { description, duration_minutes, earliest, latest } = parsed.data;
      const now = new Date();
      const timeMin = earliest ?? now.toISOString();
      // Default search window: next 7 days
      const timeMax = latest ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

      // Cache key based on user + window + duration (busy intervals change slowly)
      const cacheKey = `slots:${auth.userId}:${timeMin}:${timeMax}:${duration_minutes}`;
      const cached = aiCache.slots.get(cacheKey);
      if (cached) {
        res.status(200).json({ ...(cached as object), cached: true });
        return;
      }

      // 1. Get busy intervals from Google Calendar via Corsair
      const tenant = getCorsairTenant(auth.userId);
      const availability = await checkAvailability(tenant, { timeMin, timeMax, calendarIds: ["primary"] });
      const busy: Array<{ start: string; end: string }> = availability.flatMap((a) => a.busy);

      // 2. Generate candidate slots (every 30 min during business hours), reject overlaps
      const slots: Array<{ start: string; end: string; score: number; reason: string }> = [];
      const cursor = new Date(timeMin);
      const end = new Date(timeMax);
      // Round up to next 30-min boundary
      cursor.setMinutes(cursor.getMinutes() < 30 ? 30 : 60, 0, 0);
      while (cursor < end && slots.length < 20) {
        const slotStart = new Date(cursor);
        const slotEnd = new Date(cursor.getTime() + duration_minutes * 60 * 1000);
        const hour = slotStart.getHours();
        const day = slotStart.getDay();
        // Skip weekends + outside 9-17 local time
        const inBusinessHours = day >= 1 && day <= 5 && hour >= 9 && hour < 17 && slotEnd.getHours() <= 18;
        const conflicts = busy.some(
          (b) => new Date(b.start) < slotEnd && new Date(b.end) > slotStart,
        );
        if (inBusinessHours && !conflicts) {
          // Score: prefer mid-morning (10-11) and mid-afternoon (14-15), penalise late-day
          let score = 50;
          if (hour === 10 || hour === 14) score += 30;
          else if (hour === 11 || hour === 15) score += 20;
          else if (hour === 9 || hour === 16) score += 10;
          slots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            score,
            reason: hour === 10 || hour === 14 ? "Prime focus time" : "Available",
          });
        }
        cursor.setMinutes(cursor.getMinutes() + 30);
      }

      // 3. Top 5 by score, then chronologically within ties
      const ranked = slots.sort((a, b) => b.score - a.score || a.start.localeCompare(b.start)).slice(0, 5);

      // 4. Optional AI re-ranking with rationale
      let aiRationale: string | null = null;
      if (isAiAvailable() && ranked.length > 0) {
        const slotsList = ranked
          .map((s, i) => `${i + 1}. ${new Date(s.start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`)
          .join("\n");
        const aiPrompt = `Meeting description: "${description}"
Duration: ${duration_minutes} minutes

Available time slots:
${slotsList}

In one short sentence, recommend which slot is best for this meeting and why. Reply with plain text, max 30 words.`;
        aiRationale = await chat(aiPrompt, "You are a helpful scheduling assistant.", { maxTokens: 80 });
      }

      const payload = {
        slots: ranked,
        rationale: aiRationale,
        searched_window: { start: timeMin, end: timeMax },
        ai_available: isAiAvailable(),
      };
      aiCache.slots.set(cacheKey, payload);
      emitAuditEvent(req, "ai_suggest_slots", { duration_minutes, slot_count: ranked.length });
      res.status(200).json({ ...payload, cached: false });
    } catch (err) { next(err); }
  }
);

// ── POST /v1/ai/search-emails ─────────────────────────────────────────────────
// Semantic email search — natural-language query -> top-K threads by cosine similarity
const searchEmailsSchema = z.object({
  query: z.string().min(2).max(300),
  limit: z.number().int().min(1).max(20).default(10),
});

aiRouter.post(
  "/ai/search-emails",
  requireAuth,
  requireFeature("email_read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const parsed = searchEmailsSchema.safeParse(req.body);
      if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid search payload", false, req.traceId);

      if (!isAiAvailable()) {
        res.status(200).json({ ai_available: false, results: [], hint: "Set OPENAI_API_KEY to enable semantic search." });
        return;
      }
      if (!(await embeddingsAvailable())) {
        res.status(200).json({
          ai_available: true,
          embeddings_available: false,
          results: [],
          hint: "pgvector extension not available on this Postgres instance — falling back to keyword search.",
        });
        return;
      }

      // Embed the query (cache by query string — same query = same vector)
      const cacheKey = `embed:${parsed.data.query.toLowerCase().trim()}`;
      let queryVec = aiCache.embed.get(cacheKey);
      if (!queryVec) {
        const v = await embed(parsed.data.query);
        if (!v) {
          res.status(200).json({ ai_available: true, results: [], hint: "Could not embed query." });
          return;
        }
        queryVec = v;
        aiCache.embed.set(cacheKey, queryVec);
      }

      const results = await searchEmbeddings(auth.userId, queryVec, parsed.data.limit);
      emitAuditEvent(req, "ai_search_emails", { query_len: parsed.data.query.length, result_count: results.length });
      res.status(200).json({ ai_available: true, embeddings_available: true, results });
    } catch (err) { next(err); }
  }
);

// ── POST /v1/ai/index-emails ──────────────────────────────────────────────────
// Backfill embeddings for the user's recent threads. Called once before search,
// or after fetching new mail. Idempotent — skips already-embedded content.
const indexEmailsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
});

aiRouter.post(
  "/ai/index-emails",
  requireAuth,
  requireFeature("email_read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const parsed = indexEmailsSchema.safeParse(req.body);
      if (!parsed.success) throw createApiError("VALIDATION_ERROR", "Invalid index payload", false, req.traceId);

      if (!isAiAvailable()) {
        res.status(200).json({ ai_available: false, indexed: 0, hint: "Set OPENAI_API_KEY first." });
        return;
      }
      if (!(await embeddingsAvailable())) {
        res.status(200).json({ ai_available: true, embeddings_available: false, indexed: 0, hint: "pgvector not installed." });
        return;
      }

      const threads = await fetchGmailThreads(getCorsairTenant(auth.userId), auth.userId, parsed.data.limit);
      let indexed = 0;
      let skipped = 0;

      // Embed in serial to avoid hammering OpenAI rate limit (~50 req/sec on tier 1)
      for (const t of threads) {
        const content = `${t.subject}\n${t.snippet}`.trim();
        if (!content || content.length < 10) { skipped++; continue; }
        if (await isAlreadyEmbedded(auth.userId, t.id, content)) { skipped++; continue; }
        const vec = await embed(content);
        if (!vec) { skipped++; continue; }
        await upsertEmbedding(
          { user_id: auth.userId, thread_id: t.id, subject: t.subject, snippet: t.snippet, from_addr: t.from },
          content,
          vec,
        );
        indexed++;
      }

      emitAuditEvent(req, "ai_index_emails", { indexed, skipped, total: threads.length });
      res.status(200).json({ ai_available: true, embeddings_available: true, indexed, skipped, total: threads.length });
    } catch (err) { next(err); }
  }
);

