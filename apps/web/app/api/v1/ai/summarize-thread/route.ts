import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { fetchGmailThread } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { chat, isAiAvailable, MODEL } from "@googenie/server/integrations/openai";
import { aiCache } from "@googenie/server/lib/cache";
import { stripHtml } from "@googenie/server/lib/html";
import { checkFeature, notFound } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const summarizeSchema = z.object({ thread_id: z.string().min(1) });

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "ai_summary");
  if (gate) return gate;
  const parsed = await validateBody(summarizeSchema, req, { traceId, message: "thread_id is required" });
  if (!parsed.ok) return parsed.response;
  const { thread_id } = parsed.data;

  if (!isAiAvailable()) {
    return NextResponse.json({ ai_available: false, hint: "Set MISTRAL_API_KEY to enable AI summaries." });
  }

  const cacheKey = `summary:${auth!.userId}:${thread_id}`;
  const cached = aiCache.summary.get(cacheKey);
  if (cached) return NextResponse.json({ ...(cached as object), cached: true, ai_available: true });

  const tenant = getCorsairTenant(auth!.userId);
  const thread = await fetchGmailThread(tenant, thread_id, auth!.userId);
  if (!thread) return notFound("Thread not found", traceId);

  const content = thread.bodyHtml ? stripHtml(thread.bodyHtml) : thread.snippet;
  if (!content || content.length < 20) {
    return NextResponse.json({ summary: "This email appears to be empty.", key_points: [], action_items: [], sentiment: "neutral", model: MODEL });
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
    return NextResponse.json({ summary: "Could not generate summary.", key_points: [], action_items: [], sentiment: "neutral", model: MODEL });
  }
  let result: { summary: string; key_points: string[]; action_items: string[]; sentiment: string };
  try { result = JSON.parse(raw); }
  catch { result = { summary: raw.slice(0, 500), key_points: [], action_items: [], sentiment: "neutral" }; }

  const payload = { ...result, model: MODEL, ai_available: true };
  aiCache.summary.set(cacheKey, payload);
  return NextResponse.json({ ...payload, cached: false });
});
