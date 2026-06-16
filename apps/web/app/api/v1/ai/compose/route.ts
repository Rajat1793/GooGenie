import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { chat, isAiAvailable, MODEL } from "@googenie/server/integrations/openai";
import { getUserById, getUserByClerkId } from "@googenie/db/users";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const composeSchema = z.object({
  type: z.enum(["new", "reply"]),
  tone: z.enum(["professional", "friendly", "concise"]).default("professional"),
  context: z.string().max(1000),
  thread_snippet: z.string().max(2000).optional(),
  recipient_name: z.string().max(100).optional(),
});

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "ai_compose");
  if (gate) return gate;
  const parsed = await validateBody(composeSchema, req, { traceId, message: "Invalid compose payload" });
  if (!parsed.ok) return parsed.response;
  const { type, tone, context, thread_snippet, recipient_name } = parsed.data;

  if (!isAiAvailable()) {
    return NextResponse.json({ ai_available: false, hint: "Set MISTRAL_API_KEY to enable AI compose." });
  }

  const dbUser = (await getUserById(auth!.userId)) ?? (await getUserByClerkId(auth!.userId));
  const senderName =
    dbUser?.displayName?.trim() || (dbUser?.email ? dbUser.email.split("@")[0] : null) || null;

  const toneInstructions: Record<string, string> = {
    professional: "formal, polished, business-appropriate language",
    friendly: "warm, approachable, conversational but still respectful",
    concise: "short and to the point — no fluff, under 5 sentences",
  };

  const basePrompt =
    type === "reply"
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

${senderName
  ? `Sign the email "${senderName}" — DO NOT use placeholders like "[Your Name]", "[Sender Name]", or "[Name]". Use the real name "${senderName}" exactly.`
  : `If the email needs a signature, just use "Best regards" with no name placeholder. NEVER write "[Your Name]" or any bracketed placeholder.`}

Respond with ONLY valid JSON matching this exact shape:
{
  "subject": "email subject line (omit if this is a reply)",
  "body": "the main email body",
  "alternatives": ["shorter alternative body", "different angle or opening alternative body"]
}`;

  const raw = await chat(prompt, "You are an expert email writing assistant. Always respond with valid JSON only.", {
    jsonMode: true,
    maxTokens: 800,
  });
  if (!raw) return NextResponse.json({ body: "Could not generate email.", alternatives: [], model: MODEL });

  let result: { subject?: string; body: string; alternatives: string[] };
  try {
    result = JSON.parse(raw);
  } catch {
    result = { body: raw.slice(0, 800), alternatives: [] };
  }

  const placeholderRe = /\[\s*(your|sender|user|my)?\s*name\s*\]/gi;
  const scrub = (s: string | undefined): string | undefined => {
    if (!s) return s;
    if (senderName) return s.replace(placeholderRe, senderName);
    return s
      .split("\n")
      .filter((line) => !placeholderRe.test(line))
      .join("\n");
  };
  result.body = scrub(result.body)!;
  result.alternatives = (result.alternatives ?? []).map((a) => scrub(a)!).filter(Boolean);

  return NextResponse.json({ ...result, model: MODEL, ai_available: true });
});
