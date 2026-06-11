/**
 * Simple offset-based cursor pagination.
 * cursor = base64url(offset number)
 * Returns {items, next_cursor, total}
 */

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  next_cursor: string | null;
}

export function paginate<T>(
  all: T[],
  rawCursor: string | undefined,
  rawLimit: string | undefined
): PaginatedResult<T> {
  const limit = Math.min(Math.max(1, parseInt(rawLimit ?? "20", 10) || 20), 100);
  const offset = rawCursor ? decodeCursor(rawCursor) : 0;

  const items = all.slice(offset, offset + limit);
  const next = offset + limit < all.length ? encodeCursor(offset + limit) : null;

  return { items, total: all.length, next_cursor: next };
}

export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): number {
  try {
    const n = parseInt(Buffer.from(cursor, "base64url").toString("utf8"), 10);
    return isNaN(n) || n < 0 ? 0 : n;
  } catch {
    return 0;
  }
}
