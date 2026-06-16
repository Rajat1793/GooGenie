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
      delete: { tags: ["Email"], summary: "Delete a draft", responses: { 204: { description: "Deleted" } } },
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
    "/ai/index-emails": {
      post: { tags: ["AI"], summary: "Backfill email embeddings for semantic search", responses: { 200: { description: "Counts" } } },
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
  },
} as const;
