/**
 * Email embedding store — pgvector backed.
 *
 * Provides:
 *   - upsertEmbedding(): idempotent write of subject+snippet vector
 *   - searchEmbeddings(): top-K nearest neighbours by cosine distance
 *   - embeddingsAvailable(): runtime check for pgvector extension
 *
 * If pgvector is not installed the search route degrades gracefully.
 */
import crypto from "node:crypto";
import { db } from "./client.js";
import { sql } from "drizzle-orm";

let _available: boolean | null = null;

export async function embeddingsAvailable(): Promise<boolean> {
  if (_available !== null) return _available;
  try {
    const result = await db.execute(
      sql`SELECT 1 FROM pg_extension WHERE extname = 'vector' LIMIT 1`,
    );
    _available = (result as unknown as { rows: unknown[] }).rows.length > 0;
  } catch {
    _available = false;
  }
  return _available;
}

export function hashContent(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/** Convert JS number[] to pgvector literal `[0.1, 0.2, ...]` */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export interface EmbeddingRow {
  user_id: string;
  thread_id: string;
  subject: string | null;
  snippet: string | null;
  from_addr: string | null;
}

/**
 * Insert or update a thread's embedding. Skips re-embedding if content hash
 * matches the existing row (caller can decide whether to recompute the vector).
 */
export async function upsertEmbedding(
  row: EmbeddingRow,
  content: string,
  vector: number[],
): Promise<void> {
  if (!(await embeddingsAvailable())) return;
  const contentHash = hashContent(content);
  const vecLit = toVectorLiteral(vector);
  await db.execute(sql`
    INSERT INTO email_embeddings
      (user_id, thread_id, subject, snippet, from_addr, content_hash, embedding)
    VALUES
      (${row.user_id}, ${row.thread_id}, ${row.subject}, ${row.snippet}, ${row.from_addr}, ${contentHash}, ${vecLit}::vector)
    ON CONFLICT (user_id, thread_id) DO UPDATE
      SET subject = EXCLUDED.subject,
          snippet = EXCLUDED.snippet,
          from_addr = EXCLUDED.from_addr,
          content_hash = EXCLUDED.content_hash,
          embedding = EXCLUDED.embedding,
          created_at = NOW()
  `);
}

export interface SearchResult {
  thread_id: string;
  subject: string | null;
  snippet: string | null;
  from_addr: string | null;
  similarity: number;
}

/**
 * Cosine-similarity search over the user's email_embeddings.
 * pgvector's `<=>` operator returns cosine distance (0=identical, 2=opposite),
 * so similarity = 1 - distance.
 */
export async function searchEmbeddings(
  userId: string,
  queryVector: number[],
  limit = 10,
): Promise<SearchResult[]> {
  if (!(await embeddingsAvailable())) return [];
  const vecLit = toVectorLiteral(queryVector);
  const result = await db.execute(sql`
    SELECT thread_id, subject, snippet, from_addr,
           (1 - (embedding <=> ${vecLit}::vector)) AS similarity
    FROM email_embeddings
    WHERE user_id = ${userId}
    ORDER BY embedding <=> ${vecLit}::vector
    LIMIT ${limit}
  `);
  // drizzle's execute returns rows on `.rows`
  const rows = (result as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];
  return rows.map((r) => ({
    thread_id: String(r.thread_id),
    subject: r.subject as string | null,
    snippet: r.snippet as string | null,
    from_addr: r.from_addr as string | null,
    similarity: Number(r.similarity),
  }));
}

/** Has this thread+content already been embedded for this user? */
export async function isAlreadyEmbedded(
  userId: string,
  threadId: string,
  content: string,
): Promise<boolean> {
  if (!(await embeddingsAvailable())) return false;
  const contentHash = hashContent(content);
  const result = await db.execute(sql`
    SELECT 1 FROM email_embeddings
    WHERE user_id = ${userId} AND thread_id = ${threadId} AND content_hash = ${contentHash}
    LIMIT 1
  `);
  const rows = (result as unknown as { rows: unknown[] }).rows ?? [];
  return rows.length > 0;
}
