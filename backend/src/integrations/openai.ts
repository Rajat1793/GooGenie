/**
 * Mistral AI client wrapper (OpenAI-compatible endpoint).
 *
 * Uses mistral-small-latest — free tier, no rate limits.
 * Set MISTRAL_API_KEY in your environment. Without the key every function
 * returns null and endpoints return a graceful "AI not configured" response.
 *
 * Usage:
 *   import { chat, MODEL } from "./openai.js";
 *   const reply = await chat("Summarise this email…");
 */
import OpenAI from "openai";

export const MODEL = "mistral-small-latest";
export const EMBEDDING_MODEL = "mistral-embed";
export const EMBEDDING_DIM = 1024;

// Lazy singleton so we only create the client when the key is present
let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!process.env.MISTRAL_API_KEY) return null;
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.MISTRAL_API_KEY,
      baseURL: "https://api.mistral.ai/v1",
    });
  }
  return _client;
}

export function isAiAvailable(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY);
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

/**
 * Generate an embedding vector for arbitrary text.
 * Returns null if AI unavailable or on API failure.
 *
 * Used by the semantic email search feature — input text is passed to
 * text-embedding-3-small (1536-dim, ~$0.02 per million tokens).
 */
export async function embed(text: string): Promise<number[] | null> {
  const client = getClient();
  if (!client) return null;
  if (!text || text.trim().length === 0) return null;
  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000), // ~8K char cap, well under token limit
    });
    return response.data[0]?.embedding ?? null;
  } catch (err) {
    console.warn("[mistral] embed failed:", (err as Error).message);
    return null;
  }
}

