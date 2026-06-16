/**
 * Data access for `booking_links` — public Calendly-style booking pages.
 */
import { eq, and } from "drizzle-orm";
import { db } from "./client";
import { bookingLinks } from "./schema";
import crypto from "node:crypto";

export interface BookingLink {
  id: number;
  userId: string;
  slug: string;
  title: string;
  durationMinutes: number;
  daysAhead: number;
  businessHours: { start: number; end: number };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function toRow(r: typeof bookingLinks.$inferSelect): BookingLink {
  return {
    id: r.id,
    userId: r.userId,
    slug: r.slug,
    title: r.title,
    durationMinutes: r.durationMinutes,
    daysAhead: r.daysAhead,
    businessHours: r.businessHours,
    isActive: r.isActive,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
  };
}

function genSlug(): string {
  // 8 hex chars — URL-safe, ~1B namespace, low collision risk for a single
  // user's link count. If it collides, the unique constraint surfaces the
  // error and the caller retries.
  return crypto.randomBytes(4).toString("hex");
}

export async function getBookingLinkBySlug(slug: string): Promise<BookingLink | null> {
  const [row] = await db
    .select()
    .from(bookingLinks)
    .where(eq(bookingLinks.slug, slug))
    .limit(1);
  return row ? toRow(row) : null;
}

export async function listUserBookingLinks(userId: string): Promise<BookingLink[]> {
  const rows = await db
    .select()
    .from(bookingLinks)
    .where(eq(bookingLinks.userId, userId));
  return rows.map(toRow);
}

export interface NewBookingLink {
  userId: string;
  title?: string;
  durationMinutes?: number;
  daysAhead?: number;
  businessHours?: { start: number; end: number };
}

export async function createBookingLink(input: NewBookingLink): Promise<BookingLink> {
  // Retry slug generation a few times if collision (extremely rare).
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const [row] = await db
        .insert(bookingLinks)
        .values({
          userId: input.userId,
          slug: genSlug(),
          title: input.title ?? "Book a meeting",
          durationMinutes: input.durationMinutes ?? 30,
          daysAhead: input.daysAhead ?? 14,
          businessHours: input.businessHours ?? { start: 9, end: 18 },
          isActive: true,
        })
        .returning();
      return toRow(row);
    } catch (err) {
      if (!(err instanceof Error && /unique/i.test(err.message))) throw err;
    }
  }
  throw new Error("Failed to allocate a unique booking slug");
}

export interface UpdateBookingLink {
  title?: string;
  durationMinutes?: number;
  daysAhead?: number;
  businessHours?: { start: number; end: number };
  isActive?: boolean;
}

export async function updateBookingLink(
  id: number,
  userId: string,
  patch: UpdateBookingLink,
): Promise<BookingLink | null> {
  const [row] = await db
    .update(bookingLinks)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(bookingLinks.id, id), eq(bookingLinks.userId, userId)))
    .returning();
  return row ? toRow(row) : null;
}

export async function deleteBookingLink(id: number, userId: string): Promise<boolean> {
  const res = await db
    .delete(bookingLinks)
    .where(and(eq(bookingLinks.id, id), eq(bookingLinks.userId, userId)))
    .returning({ id: bookingLinks.id });
  return res.length > 0;
}
