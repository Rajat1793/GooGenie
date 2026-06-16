/**
 * POST /api/v1/ai/search-emails
 *
 * Semantic search over the user's previously-indexed Gmail threads.
 * Returns top-K cosine-similar thread metadata so the UI can render
 * clickable cards. Falls back to {results: []} with a hint when pgvector
 * isn't installed or when the user hasn't indexed yet.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { isAiAvailable, embed } from "@googenie/server/integrations/openai";
import { embeddingsAvailable, searchEmbeddings } from "@googenie/db/embeddings";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const searchSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(50).default(10),
});

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "ai_summary");
  if (gate) return gate;

  const parsed = await validateBody(searchSchema, req, {
    traceId,
    message: "Invalid search-emails payload",
  });
  if (!parsed.ok) return parsed.response;
  const { query, limit } = parsed.data;

  if (!isAiAvailable()) {
    return NextResponse.json({
      ai_available: false,
      embeddings_available: false,
      results: [],
      hint: "Set MISTRAL_API_KEY to enable AI features.",
    });
  }

  if (!(await embeddingsAvailable())) {
    return NextResponse.json({
      ai_available: true,
      embeddings_available: false,
      results: [],
      hint: "pgvector extension is not installed — semantic search unavailable.",
    });
  }

  const vector = await embed(query);
  if (!vector) {
    return NextResponse.json({
      ai_available: true,
      embeddings_available: true,
      results: [],
      hint: "Failed to compute query embedding — try again.",
    });
  }

  const rows = await searchEmbeddings(auth!.userId, vector, limit);
  return NextResponse.json({
    ai_available: true,
    embeddings_available: true,
    results: rows.map((r) => ({
      thread_id: r.thread_id,
      subject: r.subject ?? "(no subject)",
      snippet: r.snippet ?? "",
      from: r.from_addr ?? "",
      similarity: r.similarity,
    })),
  });
});
