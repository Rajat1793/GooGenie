/**
 * POST /api/v1/ai/index-emails
 *
 * Embed the user's recent Gmail threads (subject + snippet) and persist into
 * `email_embeddings` (pgvector) so /ai/search-emails can do semantic search.
 * Idempotent — skips threads whose content hash hasn't changed.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiMiddleware } from "@googenie/server";
import { validateBody } from "@googenie/server/lib/validateNext";
import { isAiAvailable, embed } from "@googenie/server/integrations/openai";
import { fetchGmailThreads } from "@googenie/server/integrations/gmail";
import { getCorsairTenant } from "@googenie/server/integrations/corsair-tenant";
import {
  embeddingsAvailable,
  upsertEmbedding,
  isAlreadyEmbedded,
} from "@googenie/db/embeddings";
import { checkFeature } from "../../_lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const indexEmailsSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
});

export const POST = withApiMiddleware(async (req, { auth, traceId }) => {
  const gate = await checkFeature(req, "ai_summary");
  if (gate) return gate;

  const parsed = await validateBody(indexEmailsSchema, req, {
    traceId,
    message: "Invalid index-emails payload",
  });
  if (!parsed.ok) return parsed.response;
  const { limit } = parsed.data;

  if (!isAiAvailable()) {
    return NextResponse.json({
      ai_available: false,
      indexed: 0,
      skipped: 0,
      total: 0,
      hint: "Set MISTRAL_API_KEY to enable AI features.",
    });
  }

  if (!(await embeddingsAvailable())) {
    return NextResponse.json({
      ai_available: true,
      embeddings_available: false,
      indexed: 0,
      skipped: 0,
      total: 0,
      hint: "pgvector extension is not installed on this database — semantic search unavailable.",
    });
  }

  const corsairTenant = getCorsairTenant(auth!.userId);
  const threads = await fetchGmailThreads(corsairTenant, auth!.userId, limit).catch(
    () => [],
  );

  let indexed = 0;
  let skipped = 0;
  for (const t of threads) {
    const subject = t.subject ?? "";
    const snippet = (t.snippet ?? "").slice(0, 1000);
    const content = `${subject}\n\n${snippet}`.trim();
    if (!content) continue;

    if (await isAlreadyEmbedded(auth!.userId, t.id, content)) {
      skipped += 1;
      continue;
    }

    const vector = await embed(content);
    if (!vector) continue;

    await upsertEmbedding(
      {
        user_id: auth!.userId,
        thread_id: t.id,
        subject,
        snippet,
        from_addr: t.from ?? null,
      },
      content,
      vector,
    );
    indexed += 1;
  }

  return NextResponse.json({
    ai_available: true,
    embeddings_available: true,
    indexed,
    skipped,
    total: threads.length,
  });
});
