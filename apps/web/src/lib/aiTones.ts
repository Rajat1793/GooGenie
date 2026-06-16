/**
 * AI compose / reply tone — shared constant + type used by InboxPage,
 * CalendarPage smart scheduler, and any future AI compose surfaces.
 */
export const AI_TONES = ["professional", "friendly", "concise"] as const;
export type AiTone = (typeof AI_TONES)[number];
