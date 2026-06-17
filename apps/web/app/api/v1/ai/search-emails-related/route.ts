/**
 * POST /api/v1/ai/search-emails-related
 *
 * Feature A3 — Conversation memory across threads.
 *
 * Body: { thread_id: string, scope: "same_sender" | "same_topic", limit?: number }
 *
 * Returns semantically-related past threads either from the same sender or
 * on the same topic. Uses pgvector + Corsair's local message cache to pull
 * the original thread's context.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { embed, isAiAvailable } from "@googenie/server/integrations/openai";
import { fetchGmailThread } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import { embeddingsAvailable, searchEmbeddings } from "@googenie/db/embeddings";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  thread_id: z.string().min(1),
  scope: z.enum(["same_sender", "same_topic"]),
  limit: z.number().int().min(1).max(20).optional(),
});

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "ai_related_threads");
  if (gate) return gate;

  const parsed = await validateBody(bodySchema, req, { traceId, message: "Invalid payload" });
  if (!parsed.ok) return parsed.response;

  const { thread_id, scope, limit = 5 } = parsed.data;

  if (!isAiAvailable() || !(await embeddingsAvailable())) {
    return NextResponse.json({
      ai_available: false,
      related_threads: [],
      hint: "Embeddings not configured",
    });
  }

  const tenant = getCorsairTenant(auth!.userId);
  const thread = await fetchGmailThread(tenant, thread_id, auth!.userId).catch(() => undefined);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Build query embedding from subject + snippet (+ from if same_sender).
  let queryText = `${thread.subject}\n${thread.snippet ?? ""}`;
  if (scope === "same_sender" && thread.from) {
    queryText = `${thread.from}\n${queryText}`;
  }

  const queryVec = await embed(queryText);
  if (!queryVec) {
    return NextResponse.json({
      ai_available: true,
      related_threads: [],
      hint: "Embedding generation failed",
    });
  }

  const hits = await searchEmbeddings(auth!.userId, queryVec, limit * 2);
  // Filter out the original thread itself + apply scope logic.
  let filtered = hits.filter((h) => h.thread_id !== thread_id);

  if (scope === "same_sender" && thread.from) {
    const senderEmail = (/<([^>]+)>/.exec(thread.from) ?? [null, thread.from])[1]?.toLowerCase();
    if (senderEmail) {
      filtered = filtered.filter((h) => (h.from_addr ?? "").toLowerCase().includes(senderEmail));
    }
  }

  const related = filtered.slice(0, limit).map((h) => ({
    thread_id: h.thread_id,
    subject: h.subject ?? "(no subject)",
    from: h.from_addr ?? "",
    snippet: (h.snippet ?? "").slice(0, 200),
    similarity: h.similarity,
  }));

  return NextResponse.json({
    ai_available: true,
    scope,
    original_thread: { id: thread.id, subject: thread.subject, from: thread.from },
    related_threads: related,
  });
});
