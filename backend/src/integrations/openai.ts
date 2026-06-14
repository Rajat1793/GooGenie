/**
 * OpenAI client wrapper.
 *
 * Uses gpt-4o-mini by default — fast, cheap, great for email tasks.
 * Set OPENAI_API_KEY in your environment. Without the key every function
 * returns null and endpoints return a graceful "AI not configured" response.
 *
 * Usage:
 *   import { chat, MODEL } from "./openai.js";
 *   const reply = await chat("Summarise this email…");
 */
import OpenAI from "openai";

export const MODEL = "gpt-4o-mini";

// Lazy singleton so we only create the client when the key is present
let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export function isAiAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Simple single-turn chat completion.
 * Returns the assistant message text or null if AI is unavailable.
 */
export async function chat(
  userPrompt: string,
  systemPrompt = "You are a helpful AI assistant for an email and calendar workspace.",
  options?: { jsonMode?: boolean; maxTokens?: number }
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
    response_format: options?.jsonMode ? { type: "json_object" } : undefined,
    max_tokens: options?.maxTokens ?? 1024,
    temperature: 0.4,
  });

  return response.choices[0]?.message?.content ?? null;
}

/**
 * Tool-calling wrapper for the agent endpoint.
 * Returns the full completion so callers can inspect tool_calls.
 */
export async function chatWithTools(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  tools: OpenAI.Chat.ChatCompletionTool[]
): Promise<OpenAI.Chat.ChatCompletion | null> {
  const client = getClient();
  if (!client) return null;

  return client.chat.completions.create({
    model: MODEL,
    messages,
    tools,
    tool_choice: "auto",
    temperature: 0.3,
  });
}
