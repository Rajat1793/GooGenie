/**
 * Convert backend audit-event action codes (e.g. `email_message_sent`) into
 * human-readable activity descriptions using metadata from the event.
 *
 * Goal: end-users in the profile page should see "Sent an email to alice@…"
 * rather than `POST /v1/email/messages/send`.
 */

type Meta = Record<string, unknown> | undefined;

function str(meta: Meta, key: string): string | undefined {
  if (!meta) return undefined;
  const v = meta[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function num(meta: Meta, key: string): number | undefined {
  if (!meta) return undefined;
  const v = meta[key];
  return typeof v === "number" ? v : undefined;
}

const ICONS: Record<string, string> = {
  // email
  email_threads_read: "inbox",
  email_thread_read: "mail",
  email_message_sent: "send",
  email_thread_replied: "reply",
  email_thread_labels_modified: "label",
  email_thread_trashed: "delete",
  email_thread_untrashed: "restore_from_trash",
  email_batch_modify: "checklist",
  email_draft_created: "draft",
  email_draft_sent: "send",
  email_draft_deleted: "delete",
  // calendar
  calendar_events_read: "calendar_month",
  calendar_event_create: "event_available",
  calendar_event_update: "edit_calendar",
  calendar_event_delete: "event_busy",
  calendar_availability_checked: "schedule",
  // me / self-service
  me_profile_read: "person",
  me_features_read: "toggle_on",
  me_activity_read: "history",
  me_feature_request_created: "request_quote",
  me_feature_request_decided: "task_alt",
  // admin
  admin_users_list_read: "group",
  admin_user_role_update: "manage_accounts",
  admin_user_manager_update: "supervisor_account",
  admin_activity_read: "visibility",
  // manager
  manager_users_read: "people",
  manager_user_activity_read: "timeline",
  manager_user_feature_update: "toggle_on",
  manager_bulk_set_feature_access: "sync",
  // agent / webhook
  agent_execute: "smart_toy",
  webhook_received: "webhook",
};

export function activityIcon(action: string): string {
  return ICONS[action] ?? "info";
}

/**
 * Render a single activity event as a short, readable sentence.
 * Falls back to a humanised version of the action code if no rule matches.
 */
export function formatActivity(action: string, metadata?: Meta): string {
  switch (action) {
    // ── Email ──────────────────────────────────────────────────────────
    case "email_threads_read": {
      const count = num(metadata, "count");
      return typeof count === "number"
        ? `Opened inbox (${count} thread${count === 1 ? "" : "s"})`
        : "Opened inbox";
    }
    case "email_thread_read":
      return "Read an email thread";
    case "email_message_sent": {
      const to = str(metadata, "to");
      return to ? `Sent an email to ${to}` : "Sent an email";
    }
    case "email_thread_replied":
      return "Replied to an email thread";
    case "email_thread_labels_modified":
      return "Updated labels on an email thread";
    case "email_thread_trashed":
      return "Moved an email thread to trash";
    case "email_thread_untrashed":
      return "Restored an email thread from trash";
    case "email_batch_modify": {
      const c = num(metadata, "count");
      return typeof c === "number" ? `Batch-modified ${c} email${c === 1 ? "" : "s"}` : "Batch-modified emails";
    }
    case "email_draft_created":
      return "Created an email draft";
    case "email_draft_sent":
      return "Sent an email draft";
    case "email_draft_deleted":
      return "Deleted an email draft";

    // ── Calendar ──────────────────────────────────────────────────────
    case "calendar_events_read": {
      const c = num(metadata, "count");
      return typeof c === "number"
        ? `Viewed calendar (${c} event${c === 1 ? "" : "s"})`
        : "Viewed calendar";
    }
    case "calendar_event_create":
      return "Created a calendar event";
    case "calendar_event_update":
      return "Updated a calendar event";
    case "calendar_event_delete":
      return "Deleted a calendar event";
    case "calendar_availability_checked":
      return "Checked calendar availability";

    // ── Self-service / profile ────────────────────────────────────────
    case "me_profile_read":
      return "Viewed own profile";
    case "me_features_read":
      return "Viewed feature access";
    case "me_activity_read":
      return "Viewed recent activity";
    case "me_feature_request_created": {
      const f = str(metadata, "feature_key");
      return f ? `Requested access to "${f.replace(/_/g, " ")}"` : "Requested feature access";
    }
    case "me_feature_request_decided": {
      const f = str(metadata, "feature_key");
      const decision = str(metadata, "decision");
      const verb = decision === "approved" ? "Approved" : decision === "denied" ? "Denied" : "Decided";
      return f ? `${verb} feature request for "${f.replace(/_/g, " ")}"` : `${verb} a feature request`;
    }

    // ── Admin ─────────────────────────────────────────────────────────
    case "admin_users_list_read":
      return "Viewed user roster";
    case "admin_user_role_update": {
      const role = str(metadata, "new_role");
      return role ? `Changed a user's role to ${role.replace(/_/g, " ")}` : "Updated a user's role";
    }
    case "admin_user_manager_update":
      return "Reassigned a user's manager";
    case "admin_activity_read":
      return "Reviewed activity log";

    // ── Manager ───────────────────────────────────────────────────────
    case "manager_users_read":
      return "Viewed team members";
    case "manager_user_activity_read":
      return "Viewed a team member's activity";
    case "manager_user_feature_update": {
      const f = str(metadata, "feature_key");
      const enabled = metadata?.["is_enabled"] === true;
      const verb = enabled ? "Granted" : "Revoked";
      return f ? `${verb} "${f.replace(/_/g, " ")}" for a team member` : `${verb} a feature for a team member`;
    }
    case "manager_bulk_set_feature_access": {
      const c = num(metadata, "updated_count");
      return typeof c === "number"
        ? `Bulk updated feature access for ${c} user${c === 1 ? "" : "s"}`
        : "Bulk updated feature access";
    }

    // ── Misc ──────────────────────────────────────────────────────────
    case "agent_execute":
      return "Ran an AI agent action";
    case "webhook_received":
      return "Received an external webhook";
  }

  // Fallback: humanise the action code itself.
  const human = action.replace(/_/g, " ");
  return human.charAt(0).toUpperCase() + human.slice(1);
}
