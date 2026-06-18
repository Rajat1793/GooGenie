/**
 * OpenAPI v1 spec — ported from backend/src/routes/system.ts to live alongside
 * the Next.js route handlers. Served as JSON at /api-docs/openapi.json so the
 * Swagger UI page (/api-docs) can fetch it from the same origin.
 */
export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "GooGenie API",
    version: "1.0.0",
    description:
      "AI-first Gmail + Calendar workspace — role-based access for Big Boss, Teachers & Students.",
  },
  servers: [{ url: "/v1", description: "API v1" }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Clerk JWT or HMAC demo token",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          trace_id: { type: "string" },
          retryable: { type: "boolean" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string" },
          displayName: { type: "string" },
          role: { type: "string", enum: ["super_admin", "manager_admin", "user"] },
          managerUserId: { type: "string", nullable: true },
          isActive: { type: "boolean" },
        },
      },
      EmailThread: {
        type: "object",
        properties: {
          id: { type: "string" },
          subject: { type: "string" },
          snippet: { type: "string" },
          from: { type: "string" },
          isUnread: { type: "boolean" },
          labelIds: { type: "array", items: { type: "string" } },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CalendarEvent: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          location: { type: "string", nullable: true },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
          attendees: { type: "array", items: { type: "string" } },
          status: { type: "string" },
        },
      },
      BookingLink: {
        type: "object",
        properties: {
          id: { type: "integer" },
          userId: { type: "string" },
          slug: { type: "string" },
          title: { type: "string" },
          durationMinutes: { type: "integer" },
          daysAhead: { type: "integer" },
          businessHours: {
            type: "object",
            properties: {
              start: { type: "integer", description: "Start hour 0-23" },
              end: { type: "integer", description: "End hour 0-23" },
            },
          },
          isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Snippet: {
        type: "object",
        properties: {
          id: { type: "integer" },
          userId: { type: "string" },
          name: { type: "string" },
          body: { type: "string" },
          hotkey: { type: "string", description: "1-32 chars: letters, digits, _, -" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Draft: {
        type: "object",
        properties: {
          id: { type: "string", description: "Gmail draft ID" },
          threadId: { type: "string", nullable: true },
          subject: { type: "string" },
          to: { type: "string" },
          snippet: { type: "string" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Task: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          status: { type: "string", enum: ["open", "done", "snoozed"] },
          dueAt: { type: "string", format: "date-time", nullable: true },
          sourceThreadId: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
  paths: {
    "/auth/clerk-sync": {
      post: {
        tags: ["Auth"],
        summary: "Sync Clerk user to DB with role",
        responses: { 200: { description: "User synced" }, 400: { description: "Validation error" } },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current authenticated user",
        responses: {
          200: { description: "Current user", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/auth/managers": {
      get: { tags: ["Auth"], summary: "List available managers", responses: { 200: { description: "Managers" } } },
    },
    "/auth/select-manager": {
      post: { tags: ["Auth"], summary: "Assign a manager to current user", responses: { 200: { description: "OK" } } },
    },
    "/auth/org-tree": {
      get: { tags: ["Auth"], summary: "Get the full org hierarchy tree", responses: { 200: { description: "Org tree" } } },
    },
    "/me/connect/status": {
      get: { tags: ["Connect"], summary: "Gmail + Calendar connection status", responses: { 200: { description: "OK" } } },
    },
    "/me/connect/{plugin}/init": {
      post: {
        tags: ["Connect"],
        summary: "Start OAuth flow for a plugin",
        parameters: [{ name: "plugin", in: "path", required: true, schema: { type: "string", enum: ["gmail", "googlecalendar"] } }],
        responses: { 200: { description: "Redirect URL" } },
      },
    },
    "/email/threads": {
      get: { tags: ["Email"], summary: "List Gmail threads", responses: { 200: { description: "Threads" } } },
    },
    "/email/threads/{threadId}": {
      get: { tags: ["Email"], summary: "Get a single thread", responses: { 200: { description: "Thread" } } },
    },
    "/email/messages/send": {
      post: { tags: ["Email"], summary: "Send a new email", responses: { 200: { description: "Sent" } } },
    },
    "/email/threads/{threadId}/reply": {
      post: { tags: ["Email"], summary: "Reply to a thread", responses: { 200: { description: "Sent" } } },
    },
    "/email/threads/{threadId}/labels": {
      patch: { tags: ["Email"], summary: "Modify labels on a thread", responses: { 200: { description: "OK" } } },
    },
    "/email/threads/{threadId}/trash": {
      post: { tags: ["Email"], summary: "Move thread to trash", responses: { 200: { description: "Trashed" } } },
    },
    "/email/threads/{threadId}/untrash": {
      post: { tags: ["Email"], summary: "Restore thread from trash", responses: { 200: { description: "Untrashed" } } },
    },
    "/email/labels": {
      get: { tags: ["Email"], summary: "List Gmail labels", responses: { 200: { description: "Labels" } } },
    },
    "/email/drafts": {
      get: { tags: ["Email"], summary: "List drafts", responses: { 200: { description: "Drafts" } } },
      post: { tags: ["Email"], summary: "Create a draft", responses: { 200: { description: "Created" } } },
    },
    "/email/drafts/{draftId}/send": {
      post: { tags: ["Email"], summary: "Send a draft", responses: { 200: { description: "Sent" } } },
    },
    "/email/drafts/{draftId}": {
      patch: {
        tags: ["Email"],
        summary: "Update a draft (to / subject / body)",
        parameters: [{ name: "draftId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Updated" } },
      },
      delete: {
        tags: ["Email"],
        summary: "Delete a draft",
        parameters: [{ name: "draftId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 204: { description: "Deleted" } },
      },
    },
    "/email/sent": {
      get: {
        tags: ["Email"],
        summary: "List sent threads",
        parameters: [
          { name: "q", in: "query", required: false, schema: { type: "string" }, description: "Gmail search query" },
          { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
        ],
        responses: { 200: { description: "Sent threads" } },
      },
    },
    "/email/reply-needed": {
      get: {
        tags: ["Email"],
        summary: "AI-ranked queue of threads waiting on the user",
        responses: { 200: { description: "Threads with urgency scores" } },
      },
    },
    "/email/threads/{threadId}/snooze": {
      post: {
        tags: ["Email"],
        summary: "Snooze a thread until a wake_at timestamp",
        parameters: [{ name: "threadId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { wake_at: { type: "string", format: "date-time" } } } } },
        },
        responses: { 200: { description: "Snoozed" } },
      },
      delete: {
        tags: ["Email"],
        summary: "Unsnooze a thread",
        parameters: [{ name: "threadId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Awakened" } },
      },
    },
    "/email/newsletters": {
      get: { tags: ["Email"], summary: "Detect newsletter senders in the inbox", responses: { 200: { description: "Senders" } } },
    },
    "/email/newsletters/unsubscribe": {
      post: { tags: ["Email"], summary: "Trigger unsubscribe (list-unsubscribe header)", responses: { 200: { description: "Unsubscribed" } } },
    },
    "/email/messages/schedule": {
      post: { tags: ["Email"], summary: "Schedule an email to be sent later", responses: { 200: { description: "Scheduled" } } },
    },
    "/email/messages/scheduled": {
      get: { tags: ["Email"], summary: "List scheduled (not yet sent) messages", responses: { 200: { description: "Scheduled" } } },
    },
    "/email/messages/scheduled/{id}": {
      delete: {
        tags: ["Email"],
        summary: "Cancel a scheduled send (undo window)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 204: { description: "Cancelled" } },
      },
    },
    "/email/messages/batch-modify": {
      post: { tags: ["Email"], summary: "Batch modify message labels", responses: { 200: { description: "Updated" } } },
    },
    "/calendar/events": {
      get: { tags: ["Calendar"], summary: "List calendar events", responses: { 200: { description: "Events" } } },
      post: { tags: ["Calendar"], summary: "Create a calendar event", responses: { 200: { description: "Created" } } },
    },
    "/calendar/events/{eventId}": {
      get: { tags: ["Calendar"], summary: "Get event by ID", responses: { 200: { description: "Event" } } },
      patch: { tags: ["Calendar"], summary: "Update an event", responses: { 200: { description: "Updated" } } },
      delete: { tags: ["Calendar"], summary: "Delete an event", responses: { 204: { description: "Deleted" } } },
    },
    "/calendar/availability/check": {
      post: { tags: ["Calendar"], summary: "Check availability (free/busy)", responses: { 200: { description: "OK" } } },
    },
    "/calendar/check-conflicts": {
      post: { tags: ["Calendar"], summary: "Detect conflicts for a proposed time window", responses: { 200: { description: "Conflicts" } } },
    },
    "/calendar/daily-gaps": {
      get: { tags: ["Calendar"], summary: "Compute today's free-time gaps for the daily-gaps banner", responses: { 200: { description: "Gaps" } } },
    },
    "/calendar/events/{eventId}/suggest-reschedule": {
      post: {
        tags: ["Calendar"],
        summary: "AI-suggest reschedule slots when a meeting conflicts",
        parameters: [{ name: "eventId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Suggested slots" } },
      },
    },
    "/admin/users": {
      get: { tags: ["Admin"], summary: "List all users (super_admin only)", responses: { 200: { description: "Users" } } },
    },
    "/admin/users/{userId}/role": {
      patch: { tags: ["Admin"], summary: "Change a user's role", responses: { 200: { description: "Updated" } } },
    },
    "/admin/users/{userId}/manager": {
      patch: { tags: ["Admin"], summary: "Reassign a user's manager", responses: { 200: { description: "Updated" } } },
    },
    "/manager/users": {
      get: { tags: ["Manager"], summary: "List students managed by current teacher", responses: { 200: { description: "Students" } } },
    },
    "/manager/users/{userId}/feature-access": {
      get: { tags: ["Manager"], summary: "Get feature flags for a student", responses: { 200: { description: "Flags" } } },
      patch: { tags: ["Manager"], summary: "Update feature flags for a student", responses: { 200: { description: "Updated" } } },
    },
    "/agent/execute": {
      post: { tags: ["Agent"], summary: "Execute an AI agent task", responses: { 200: { description: "Result" } } },
    },
    "/ai/summarize-thread": {
      post: { tags: ["AI"], summary: "Summarise an email thread", responses: { 200: { description: "Summary" } } },
    },
    "/ai/compose": {
      post: { tags: ["AI"], summary: "AI-generate an email body/subject", responses: { 200: { description: "Draft" } } },
    },
    "/ai/suggest-slots": {
      post: { tags: ["AI"], summary: "Smart calendar scheduler — suggest available slots", responses: { 200: { description: "Slots" } } },
    },
    "/ai/search-emails": {
      post: { tags: ["AI"], summary: "Semantic email search via pgvector cosine similarity", responses: { 200: { description: "Results" } } },
    },
    "/ai/search-emails-related": {
      post: { tags: ["AI"], summary: "Find threads related to the current one", responses: { 200: { description: "Related" } } },
    },
    "/ai/index-emails": {
      post: { tags: ["AI"], summary: "Backfill email embeddings for semantic search", responses: { 200: { description: "Counts" } } },
    },
    "/ai/check-ooo": {
      post: { tags: ["AI"], summary: "Detect out-of-office auto-replies on a thread", responses: { 200: { description: "OOO verdict" } } },
    },
    "/ai/meetings/{eventId}/brief": {
      get: {
        tags: ["AI"],
        summary: "AI-generated pre-meeting brief (attendees, past threads, prep notes)",
        parameters: [{ name: "eventId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Brief" } },
      },
    },
    "/ai/people/insights": {
      post: { tags: ["AI"], summary: "Profile a contact from email + calendar history", responses: { 200: { description: "Insights" } } },
    },
    "/ai/threads/{threadId}/extract-meeting": {
      post: {
        tags: ["AI"],
        summary: "Extract proposed meeting details from a thread (title, attendees, time)",
        parameters: [{ name: "threadId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Extracted meeting" } },
      },
    },
    "/ai/threads/{threadId}/schedule-from-email": {
      post: {
        tags: ["AI"],
        summary: "One-click: extract a meeting from a thread and create the calendar event",
        parameters: [{ name: "threadId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Event created" } },
      },
    },
    "/me/feature-requests": {
      post: { tags: ["Features"], summary: "Submit a feature-access request", responses: { 200: { description: "Created" }, 409: { description: "Pending request exists" } } },
      get: { tags: ["Features"], summary: "List the caller's own feature requests", responses: { 200: { description: "Requests" } } },
    },
    "/me/feature-requests/incoming": {
      get: { tags: ["Features"], summary: "Incoming feature requests (manager/super_admin)", responses: { 200: { description: "Requests" } } },
    },
    "/me/feature-requests/{id}/decide": {
      post: { tags: ["Features"], summary: "Approve or deny a feature request", responses: { 200: { description: "Updated" } } },
    },

    // ── Profile & feature flags ────────────────────────────────────────────
    "/me/profile": {
      get: { tags: ["Me"], summary: "Get the caller's profile (display name, avatar, prefs)", responses: { 200: { description: "Profile" } } },
      patch: { tags: ["Me"], summary: "Update the caller's profile", responses: { 200: { description: "Updated" } } },
    },
    "/me/features": {
      get: {
        tags: ["Features"],
        summary: "Caller's feature toggles + catalog + pending requests + decision history",
        responses: { 200: { description: "Feature payload" } },
      },
    },
    "/me/activity": {
      get: { tags: ["Me"], summary: "Recent audit-log activity for the caller", responses: { 200: { description: "Activity" } } },
    },
    "/me/digest": {
      get: { tags: ["Me"], summary: "Daily digest — top threads, meetings, follow-ups, tasks", responses: { 200: { description: "Digest" } } },
    },

    // ── Tasks (lightweight to-dos extracted from email) ───────────────────
    "/me/tasks": {
      get: { tags: ["Tasks"], summary: "List the caller's tasks", responses: { 200: { description: "Tasks", content: { "application/json": { schema: { type: "object", properties: { tasks: { type: "array", items: { $ref: "#/components/schemas/Task" } } } } } } } } },
      post: { tags: ["Tasks"], summary: "Create a task", responses: { 200: { description: "Created" } } },
    },
    "/me/tasks/{taskId}": {
      patch: {
        tags: ["Tasks"],
        summary: "Update task (status / dueAt / title)",
        parameters: [{ name: "taskId", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 200: { description: "Updated" } },
      },
      delete: {
        tags: ["Tasks"],
        summary: "Delete a task",
        parameters: [{ name: "taskId", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 204: { description: "Deleted" } },
      },
    },
    "/me/tasks/extract": {
      post: { tags: ["Tasks"], summary: "AI-extract tasks from a thread", responses: { 200: { description: "Extracted tasks" } } },
    },

    // ── Follow-ups, snooze, auto-categorize ───────────────────────────────
    "/me/follow-ups": {
      get: { tags: ["Me"], summary: "Threads flagged for follow-up", responses: { 200: { description: "Follow-ups" } } },
    },
    "/me/snoozed": {
      get: { tags: ["Me"], summary: "Currently-snoozed threads", responses: { 200: { description: "Snoozed list" } } },
    },
    "/me/auto-categorize": {
      get: { tags: ["Me"], summary: "Get the caller's auto-categorize rules + toggle state", responses: { 200: { description: "Config" } } },
    },
    "/me/auto-categorize/run": {
      post: { tags: ["Me"], summary: "Run auto-categorize over the inbox once", responses: { 200: { description: "Counts" } } },
    },
    "/me/auto-categorize/toggle": {
      post: { tags: ["Me"], summary: "Enable/disable background auto-categorization", responses: { 200: { description: "Toggled" } } },
    },

    // ── Snippets (reusable text templates expanded with ;hotkey) ──────────
    "/me/snippets": {
      get: {
        tags: ["Snippets"],
        summary: "List the caller's snippets",
        responses: { 200: { description: "Snippets", content: { "application/json": { schema: { type: "object", properties: { snippets: { type: "array", items: { $ref: "#/components/schemas/Snippet" } } } } } } } },
      },
      post: {
        tags: ["Snippets"],
        summary: "Create a snippet",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "body", "hotkey"], properties: { name: { type: "string" }, body: { type: "string" }, hotkey: { type: "string" } } } } } },
        responses: { 200: { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Snippet" } } } } },
      },
    },
    "/me/snippets/{id}": {
      patch: {
        tags: ["Snippets"],
        summary: "Update a snippet",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 200: { description: "Updated" } },
      },
      delete: {
        tags: ["Snippets"],
        summary: "Delete a snippet",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 200: { description: "Deleted" } },
      },
    },

    // ── Booking links (Calendly-style public booking pages) ───────────────
    "/me/booking-links": {
      get: {
        tags: ["Booking"],
        summary: "List the caller's booking links",
        responses: { 200: { description: "Links", content: { "application/json": { schema: { type: "object", properties: { links: { type: "array", items: { $ref: "#/components/schemas/BookingLink" } } } } } } } },
      },
      post: {
        tags: ["Booking"],
        summary: "Create a booking link",
        requestBody: { required: false, content: { "application/json": { schema: { type: "object", properties: { title: { type: "string" }, duration_minutes: { type: "integer" }, days_ahead: { type: "integer" }, business_hours: { type: "object", properties: { start: { type: "integer" }, end: { type: "integer" } } } } } } } },
        responses: { 200: { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/BookingLink" } } } } },
      },
    },
    "/me/booking-links/{id}": {
      patch: {
        tags: ["Booking"],
        summary: "Update a booking link (toggle active, change duration, retitle…)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 200: { description: "Updated" } },
      },
      delete: {
        tags: ["Booking"],
        summary: "Delete a booking link",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 200: { description: "Deleted" } },
      },
    },

    // ── Public booking flow (no auth — uses slug instead of token) ────────
    "/booking/{slug}": {
      get: {
        tags: ["Booking"],
        summary: "Public booking page metadata for a slug",
        security: [],
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Page metadata" }, 404: { description: "Not found" } },
      },
    },
    "/booking/{slug}/slots": {
      get: {
        tags: ["Booking"],
        summary: "Available time slots for a public booking link",
        security: [],
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "from", in: "query", required: false, schema: { type: "string", format: "date" } },
        ],
        responses: { 200: { description: "Slots" } },
      },
    },
    "/booking/{slug}/confirm": {
      post: {
        tags: ["Booking"],
        summary: "Confirm a booking — creates the calendar event on the host's calendar",
        security: [],
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["start", "end", "guest_email"], properties: { start: { type: "string", format: "date-time" }, end: { type: "string", format: "date-time" }, guest_email: { type: "string" }, guest_name: { type: "string" }, note: { type: "string" } } } } } },
        responses: { 200: { description: "Confirmed" }, 409: { description: "Slot taken" } },
      },
    },

    // ── Admin / Manager extras ────────────────────────────────────────────
    "/admin/activity": {
      get: { tags: ["Admin"], summary: "Tenant-wide audit log (super_admin only)", responses: { 200: { description: "Activity" } } },
    },
    "/manager/bulk-actions": {
      post: { tags: ["Manager"], summary: "Bulk-update feature flags across multiple students", responses: { 200: { description: "Updated" } } },
    },
    "/auth/team": {
      get: { tags: ["Auth"], summary: "List teammates under the caller's manager", responses: { 200: { description: "Team" } } },
    },
    "/auth/bosses": {
      get: { tags: ["Auth"], summary: "List super_admins (for select-manager flow)", responses: { 200: { description: "Bosses" } } },
    },
    "/auth/login": {
      post: { tags: ["Auth"], summary: "Demo / dev password login", security: [], responses: { 200: { description: "Token" } } },
    },
    "/auth/config": {
      get: { tags: ["Auth"], summary: "Public auth config (Clerk pub key, demo mode flag)", security: [], responses: { 200: { description: "Config" } } },
    },

    // ── Infrastructure ────────────────────────────────────────────────────
    "/health": {
      get: { tags: ["System"], summary: "Liveness probe", security: [], responses: { 200: { description: "OK" } } },
    },
    "/demo/tokens": {
      get: { tags: ["System"], summary: "Mint short-lived demo HMAC tokens (dev only)", security: [], responses: { 200: { description: "Tokens" } } },
    },
    "/metrics": {
      get: { tags: ["System"], summary: "Prometheus-style metrics", responses: { 200: { description: "Metrics" } } },
    },
    "/alerts": {
      get: { tags: ["System"], summary: "Live operational alerts", responses: { 200: { description: "Alerts" } } },
    },
    "/stream": {
      get: {
        tags: ["System"],
        summary: "SSE event stream (notifications, email.received, agent.update)",
        responses: { 200: { description: "text/event-stream", content: { "text/event-stream": {} } } },
      },
    },
    "/webhooks/gmail": {
      post: { tags: ["Webhooks"], summary: "Gmail Pub/Sub push notification", security: [], responses: { 200: { description: "Ack" } } },
    },
    "/webhooks/googlecalendar": {
      post: { tags: ["Webhooks"], summary: "Google Calendar push notification", security: [], responses: { 200: { description: "Ack" } } },
    },
    "/webhooks/events": {
      get: { tags: ["Webhooks"], summary: "Recent webhook events (admin-only dashboard)", responses: { 200: { description: "Events" } } },
    },
    "/webhooks/simulate": {
      post: { tags: ["Webhooks"], summary: "Simulate a webhook event (dev / staging)", responses: { 200: { description: "Triggered" } } },
    },
  },
} as const;
