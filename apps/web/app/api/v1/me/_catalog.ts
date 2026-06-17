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
 *   - description: Optional short blurb shown in tooltips / accordion
 */
export interface FeatureCatalogEntry {
  key: string;
  label: string;
  icon: string;
  group: FeatureGroup;
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
  { key: "email_read",     label: "Read Email",        icon: "inbox",          group: "Core",
    description: "View your Gmail inbox, threads, and message bodies." },
  { key: "email_write",    label: "Send Email",        icon: "edit",           group: "Core",
    description: "Compose new emails and reply to threads." },
  { key: "calendar_read",  label: "View Calendar",     icon: "calendar_month", group: "Core",
    description: "View your Google Calendar events and availability." },
  { key: "calendar_write", label: "Manage Calendar",   icon: "edit_calendar",  group: "Core",
    description: "Create, update, and delete calendar events." },
  { key: "ai_summary",     label: "AI Summaries",      icon: "auto_awesome",   group: "Core",
    description: "Summarize email threads and search inbox semantically with AI." },
  { key: "ai_compose",     label: "AI Compose",        icon: "draw",           group: "Core",
    description: "Generate email drafts and replies with AI." },

  // ── Email AI (Tier A + C) ───────────────────────────────────────────────
  { key: "ai_sender_insights",     label: "Sender Insights",     icon: "person_search",         group: "Email AI",
    description: "View per-sender stats: response times, awaiting reply, recent threads." },
  { key: "ai_reply_needed",        label: "Reply-Needed Triage", icon: "hourglass",             group: "Email AI",
    description: "Auto-detect threads where you owe a reply, ranked by urgency." },
  { key: "ai_related_threads",     label: "Related Threads",     icon: "history",               group: "Email AI",
    description: "See semantically-related past conversations from the same sender or topic." },
  { key: "ai_auto_categorize",     label: "Auto-Categorize",     icon: "label",                 group: "Email AI",
    description: "AI auto-labels incoming mail (needs_reply, fyi, newsletter, etc.)." },
  { key: "ai_ooo_detection",       label: "OOO Detection",       icon: "event_busy",            group: "Email AI",
    description: "Detect out-of-office auto-replies and schedule follow-up reminders." },
  { key: "ai_follow_up_tracker",   label: "Follow-up Tracker",   icon: "notifications_active",  group: "Email AI",
    description: "Track sent emails awaiting replies and surface 3-day nudges." },
  { key: "ai_unsubscribe_sweep",   label: "Newsletter Cleanup",  icon: "cleaning_services",     group: "Email AI",
    description: "Scan inbox for newsletters and bulk-unsubscribe in one click." },
  { key: "ai_personalized_compose",label: "Style Matching",      icon: "signature",             group: "Email AI",
    description: "Match your historical writing style with each recipient when composing." },

  // ── Calendar AI (Tier B + C) ────────────────────────────────────────────
  { key: "ai_meeting_brief",       label: "Meeting Brief",         icon: "summarize",           group: "Calendar AI",
    description: "AI brief for each meeting: attendee history + related emails." },
  { key: "ai_smart_reschedule",    label: "Smart Reschedule",      icon: "event_repeat",        group: "Calendar AI",
    description: "AI picks 3 best alternative slots when you need to reschedule." },
  { key: "ai_schedule_from_email", label: "Schedule from Email",   icon: "calendar_today",      group: "Calendar AI",
    description: "Extract proposed meeting times from a thread + book in one click." },
  { key: "ai_daily_gaps",          label: "Calendar Gap Filler",   icon: "wb_sunny",            group: "Calendar AI",
    description: "Surface 90+ min free blocks with reply-needed batch suggestions." },
  { key: "ai_conflict_resolver",   label: "Conflict Resolver",     icon: "merge_type",          group: "Calendar AI",
    description: "AI picks which meeting to move when scheduling conflicts arise." },

  // ── Productivity (Tier C) ───────────────────────────────────────────────
  { key: "ai_task_extractor",      label: "AI Tasks",              icon: "task_alt",            group: "Productivity",
    description: "Extract action items from emails into a 'what's on my plate' list." },
  { key: "ai_inline_commands",     label: "Inline AI Commands",    icon: "terminal",            group: "Productivity",
    description: "Use slash commands like /improve, /shorten, /formal inside compose." },
  { key: "split_inbox_view",       label: "Split-View Inbox",      icon: "splitscreen",         group: "Productivity",
    description: "Toggle between stacked and Superhuman-style split inbox layout." },
  { key: "daily_digest",           label: "Daily Digest",          icon: "today",               group: "Productivity",
    description: "Get an AI-powered daily summary of emails + meetings + tasks." },
  { key: "schedule_send",          label: "Schedule Send",         icon: "schedule_send",       group: "Productivity",
    description: "Defer email delivery to a future date/time." },
];

export const FEATURE_KEYS = FEATURE_CATALOG.map((f) => f.key) as [string, ...string[]];

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

