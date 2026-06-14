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
import { getCorsairTenant } from "../integrations/corsair-tenant.js";
import { chat, isAiAvailable, MODEL } from "../integrations/openai.js";

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
      res.status(200).json({ ...result, model: MODEL, ai_available: true });
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
