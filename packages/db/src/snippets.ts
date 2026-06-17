/**
 * Data access for `snippets` — reusable text templates expanded inline in
 * compose via `;hotkey<Tab>`. Pure local-DB feature.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "./client";
import { snippets } from "./schema";

export interface Snippet {
  id: number;
  userId: string;
  tenantId: string;
  name: string;
  body: string;
  hotkey: string;
  createdAt: string;
  updatedAt: string;
}

function toRow(r: typeof snippets.$inferSelect): Snippet {
  return {
    id: r.id,
    userId: r.userId,
    tenantId: r.tenantId,
    name: r.name,
    body: r.body,
    hotkey: r.hotkey,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
  };
}

export async function listUserSnippets(userId: string): Promise<Snippet[]> {
  const rows = await db
    .select()
    .from(snippets)
    .where(eq(snippets.userId, userId))
    .orderBy(asc(snippets.name));
  return rows.map(toRow);
}

export interface NewSnippet {
  userId: string;
  tenantId: string;
  name: string;
  body: string;
  hotkey: string;
}

export async function createSnippet(input: NewSnippet): Promise<Snippet> {
  const [row] = await db
    .insert(snippets)
    .values({
      userId: input.userId,
      tenantId: input.tenantId,
      name: input.name,
      body: input.body,
      hotkey: input.hotkey,
    })
    .returning();
  return toRow(row);
}

export interface UpdateSnippet {
  name?: string;
  body?: string;
  hotkey?: string;
}

export async function updateSnippet(
  id: number,
  userId: string,
  patch: UpdateSnippet,
): Promise<Snippet | null> {
  const [row] = await db
    .update(snippets)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(snippets.id, id), eq(snippets.userId, userId)))
    .returning();
  return row ? toRow(row) : null;
}

export async function deleteSnippet(id: number, userId: string): Promise<boolean> {
  const res = await db
    .delete(snippets)
    .where(and(eq(snippets.id, id), eq(snippets.userId, userId)))
    .returning({ id: snippets.id });
  return res.length > 0;
}
