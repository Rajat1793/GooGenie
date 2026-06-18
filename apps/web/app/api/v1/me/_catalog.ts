/**
 * Shared feature catalog for /api/v1/me/* handlers and UI feature panels.
 *
 * Single source of truth — manager team page and user profile both import
 * from here so adding a new feature requires one edit.
 *
 * Fields:
 *   - key:        DB feature key (used by feature-gate.ts + user_feature_access)
 *   - label:      Human-readable name shown in toggles
 *   - icon:       Material Symbols name shown next to the toggle
 *   - group:      Bucket for visual grouping (Core | Email AI | Calendar AI | Productivity)
 *   - tier:       "basic" features are enabled for everyone by default (no token
 *                  spend, local-only logic). "addon" features burn AI tokens and
 *                  must be requested from a manager.
 *   - description: Optional short blurb shown in tooltips / accordion
 */
export interface FeatureCatalogEntry {
  key: string;
  label: string;
  icon: string;
  group: FeatureGroup;
  /** "basic" = on for all users by default. "addon" = request-gated. */
  tier: "basic" | "addon";
  description?: string;
}

export type FeatureGroup =
  | "Core"
  | "Email AI"
  | "Calendar AI"
  | "Productivity";

export const FEATURE_GROUPS: FeatureGroup[] = [
  "Core",
  "Email AI",
  "Calendar AI",
  "Productivity",
];

export const FEATURE_CATALOG: ReadonlyArray<FeatureCatalogEntry> = [
  // ── Core (existing) ─────────────────────────────────────────────────────
  // email_read & calendar_read are seeded basic; the rest of Core require
  // explicit grant (these were already part of the request flow before).
  { key: "email_read",     label: "Read Email",        icon: "inbox",          group: "Core", tier: "basic",
    description: "View your Gmail inbox, threads, and message bodies." },
  { key: "email_write",    label: "Send Email",        icon: "edit",           group: "Core", tier: "addon",
    description: "Compose new emails and reply to threads." },
  { key: "calendar_read",  label: "View Calendar",     icon: "calendar_month", group: "Core", tier: "basic",
    description: "View your Google Calendar events and availability." },
  { key: "calendar_write", label: "Manage Calendar",   icon: "edit_calendar",  group: "Core", tier: "addon",
    description: "Create, update, and delete calendar events." },
  { key: "ai_summary",     label: "AI Summaries",      icon: "auto_awesome",   group: "Core", tier: "addon",
    description: "Summarize email threads and search inbox semantically with AI." },
  { key: "ai_compose",     label: "AI Compose",        icon: "draw",           group: "Core", tier: "addon",
    description: "Generate email drafts and replies with AI." },

  // ── Email AI (Tier A + C) ───────────────────────────────────────────────
  // BASIC: pure local-DB queries / regex / no token spend.
  { key: "ai_sender_insights",     label: "Sender Insights",     icon: "person_search",         group: "Email AI", tier: "basic",
    description: "View per-sender stats: response times, awaiting reply, recent threads." },
  { key: "ai_reply_needed",        label: "Reply-Needed Triage", icon: "hourglass",             group: "Email AI", tier: "basic",
    description: "Auto-detect threads where you owe a reply, ranked by urgency." },
  { key: "ai_ooo_detection",       label: "OOO Detection",       icon: "event_busy",            group: "Email AI", tier: "basic",
    description: "Detect out-of-office auto-replies and schedule follow-up reminders." },
  { key: "ai_follow_up_tracker",   label: "Follow-up Tracker",   icon: "notifications_active",  group: "Email AI", tier: "basic",
    description: "Track sent emails awaiting replies and surface 3-day nudges." },
  { key: "ai_unsubscribe_sweep",   label: "Newsletter Cleanup",  icon: "cleaning_services",     group: "Email AI", tier: "basic",
    description: "Scan inbox for newsletters and bulk-unsubscribe in one click." },
  // ADDON: burns Mistral tokens.
  { key: "ai_related_threads",     label: "Related Threads",     icon: "history",               group: "Email AI", tier: "addon",
    description: "See semantically-related past conversations from the same sender or topic." },
  { key: "ai_auto_categorize",     label: "Auto-Categorize",     icon: "label",                 group: "Email AI", tier: "addon",
    description: "AI auto-labels incoming mail (needs_reply, fyi, newsletter, etc.)." },
  { key: "ai_personalized_compose",label: "Style Matching",      icon: "signature",             group: "Email AI", tier: "addon",
    description: "Match your historical writing style with each recipient when composing." },

  // ── Calendar AI (Tier B + C) ────────────────────────────────────────────
  // BASIC: local calendar queries only.
  { key: "ai_daily_gaps",          label: "Calendar Gap Filler",   icon: "wb_sunny",            group: "Calendar AI", tier: "basic",
    description: "Surface 90+ min free blocks with reply-needed batch suggestions." },
  // ADDON: each call invokes Mistral.
  { key: "ai_meeting_brief",       label: "Meeting Brief",         icon: "summarize",           group: "Calendar AI", tier: "addon",
    description: "AI brief for each meeting: attendee history + related emails." },
  { key: "ai_smart_reschedule",    label: "Smart Reschedule",      icon: "event_repeat",        group: "Calendar AI", tier: "addon",
    description: "AI picks 3 best alternative slots when you need to reschedule." },
  { key: "ai_schedule_from_email", label: "Schedule from Email",   icon: "calendar_today",      group: "Calendar AI", tier: "addon",
    description: "Extract proposed meeting times from a thread + book in one click." },
  { key: "ai_conflict_resolver",   label: "Conflict Resolver",     icon: "merge_type",          group: "Calendar AI", tier: "addon",
    description: "AI picks which meeting to move when scheduling conflicts arise." },

  // ── Productivity (Tier C + Enhancements) ────────────────────────────────
  // BASIC: pure UX / local infrastructure, no token spend.
  { key: "split_inbox_view",       label: "Split-View Inbox",      icon: "splitscreen",         group: "Productivity", tier: "basic",
    description: "Toggle between stacked and Superhuman-style split inbox layout." },
  { key: "schedule_send",          label: "Schedule Send",         icon: "schedule_send",       group: "Productivity", tier: "basic",
    description: "Defer email delivery to a future date/time." },
  { key: "snooze_threads",         label: "Snooze Threads",        icon: "snooze",              group: "Productivity", tier: "basic",
    description: "Hide a thread from inbox until a chosen wake-up time." },
  { key: "snippets",               label: "Snippets",              icon: "code_blocks",         group: "Productivity", tier: "basic",
    description: "Save reusable text templates and expand them inline with `;hotkey` + Tab." },
  { key: "booking_links",          label: "Booking Links",         icon: "event_available",     group: "Productivity", tier: "basic",
    description: "Share a public Calendly-style link — visitors pick a slot from your free time and it's instantly added to your calendar." },
  // ADDON: AI-powered.
  { key: "ai_task_extractor",      label: "AI Tasks",              icon: "task_alt",            group: "Productivity", tier: "addon",
    description: "Extract action items from emails into a 'what's on my plate' list." },
  { key: "ai_inline_commands",     label: "Inline AI Commands",    icon: "terminal",            group: "Productivity", tier: "addon",
    description: "Use slash commands like /improve, /shorten, /formal inside compose." },
  { key: "daily_digest",           label: "Daily Digest",          icon: "today",               group: "Productivity", tier: "addon",
    description: "Get an AI-powered daily summary of emails + meetings + tasks." },
];

export const FEATURE_KEYS = FEATURE_CATALOG.map((f) => f.key) as [string, ...string[]];

/** All feature keys that are tier="basic" — seeded enabled for every role. */
export const BASIC_FEATURE_KEYS: ReadonlyArray<string> = FEATURE_CATALOG
  .filter((f) => f.tier === "basic")
  .map((f) => f.key);

/** All feature keys that are tier="addon" — request-gated. */
export const ADDON_FEATURE_KEYS: ReadonlyArray<string> = FEATURE_CATALOG
  .filter((f) => f.tier === "addon")
  .map((f) => f.key);

/** Lookup helper — returns the entry for a key, or null. */
export function getFeatureMeta(key: string): FeatureCatalogEntry | null {
  return FEATURE_CATALOG.find((f) => f.key === key) ?? null;
}

/** Group features by their `group` field, preserving group order. */
export function groupedFeatures(): Array<{ group: FeatureGroup; features: FeatureCatalogEntry[] }> {
  return FEATURE_GROUPS.map((g) => ({
    group: g,
    features: FEATURE_CATALOG.filter((f) => f.group === g),
  })).filter((bucket) => bucket.features.length > 0);
}


