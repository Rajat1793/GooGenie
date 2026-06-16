/**
 * Shared feature catalog for /api/v1/me/* handlers.
 * Mirrors backend/src/routes/me.ts FEATURE_CATALOG.
 */
export const FEATURE_CATALOG: ReadonlyArray<{ key: string; label: string }> = [
  { key: "email_read", label: "Read Email" },
  { key: "email_write", label: "Send Email" },
  { key: "calendar_read", label: "View Calendar" },
  { key: "calendar_write", label: "Manage Calendar" },
  { key: "ai_summary", label: "AI Summaries" },
  { key: "ai_compose", label: "AI Compose" },
];

export const FEATURE_KEYS = FEATURE_CATALOG.map((f) => f.key) as [string, ...string[]];
